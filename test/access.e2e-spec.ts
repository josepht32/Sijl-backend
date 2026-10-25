import { INestApplication } from '@nestjs/common';
import {
  ACCOUNTS,
  auth,
  createCase,
  getTestApp,
  http,
  login,
  users,
} from './helpers';

describe('Role access (e2e)', () => {
  let app: INestApplication;
  let admin: { token: string; user: { id: string } };
  let manager: { token: string };
  let omar: { token: string };
  let sara: { token: string };
  let nora: { token: string };
  let khalid: { token: string };
  let omarCase: { id: string; title: string };
  let saraCase: { id: string; title: string };

  beforeAll(async () => {
    app = (await getTestApp()).app;
    admin = await login(app, ACCOUNTS.admin);
    manager = await login(app, ACCOUNTS.manager);
    omar = await login(app, ACCOUNTS.employee);
    sara = await login(app, ACCOUNTS.legal);
    nora = await login(app, ACCOUNTS.secretariat);
    khalid = await login(app, ACCOUNTS.chairman);
    omarCase = await createCase(app, omar.token, {
      title: 'Procurement exclusive correspondence',
    });
    saraCase = await createCase(app, sara.token, {
      title: 'Legal exclusive correspondence',
    });
  });

  async function caseIds(token: string) {
    const response = await http(app).get('/api/cases').set(auth(token)).expect(200);
    return (response.body.items as Array<{ id: string }>).map((item) => item.id);
  }

  it('lets an employee see only their own cases', async () => {
    const ids = await caseIds(omar.token);
    expect(ids).toContain(omarCase.id);
    expect(ids).not.toContain(saraCase.id);
    await http(app).get(`/api/cases/${saraCase.id}`).set(auth(omar.token)).expect(404);
  });

  it('lets a department manager see department-owned cases', async () => {
    const ids = await caseIds(manager.token);
    expect(ids).toContain(omarCase.id);
    expect(ids).not.toContain(saraCase.id);
  });

  it('lets the secretariat see files waiting in its office', async () => {
    const ids = await caseIds(nora.token);
    expect(ids).toContain(omarCase.id);
    expect(ids).toContain(saraCase.id);
  });

  it('lets admin and chairman see every case', async () => {
    for (const token of [admin.token, khalid.token]) {
      const ids = await caseIds(token);
      expect(ids).toEqual(expect.arrayContaining([omarCase.id, saraCase.id]));
    }
  });

  it('blocks employees from organization-wide case scope', async () => {
    await http(app)
      .get('/api/cases')
      .query({ scope: 'all' })
      .set(auth(omar.token))
      .expect(403);
  });

  it('blocks employees from admin configuration and executive analytics', async () => {
    await http(app)
      .post('/api/categories')
      .set(auth(omar.token))
      .send({
        nameEn: 'Blocked',
        nameAr: 'محظور',
        targetTimelineDays: 3,
        retentionPeriodYears: 5,
      })
      .expect(403);

    await http(app)
      .post('/api/departments')
      .set(auth(omar.token))
      .send({ nameEn: 'Blocked', nameAr: 'محظور' })
      .expect(403);

    await http(app)
      .post('/api/users')
      .set(auth(omar.token))
      .send({
        email: 'blocked@sijil.local',
        password: 'Admin123!',
        nameEn: 'Blocked',
        nameAr: 'محظور',
        role: 'employee',
      })
      .expect(403);

    await http(app).get('/api/roles').set(auth(omar.token)).expect(403);
    await http(app).get('/api/analytics/executive').set(auth(omar.token)).expect(403);
  });

  it('lets chairman read executive analytics and admin manage catalog', async () => {
    await http(app).get('/api/analytics/executive').set(auth(khalid.token)).expect(200);
    const category = await http(app)
      .post('/api/categories')
      .set(auth(admin.token))
      .send({
        nameEn: 'E2E Category',
        nameAr: 'تصنيف اختبار',
        targetTimelineDays: 6,
        retentionPeriodYears: 8,
      })
      .expect(201);
    expect(category.body.nameEn).toBe('E2E Category');
  });

  it('grants and revokes explicit case access', async () => {
    const directory = await users(app, admin.token);
    const saraId = directory.find((person) => person.email === ACCOUNTS.legal)?.id;
    expect(saraId).toBeDefined();

    await http(app)
      .post(`/api/cases/${omarCase.id}/grants`)
      .set(auth(omar.token))
      .send({ userId: saraId })
      .expect(403);

    const grant = await http(app)
      .post(`/api/cases/${omarCase.id}/grants`)
      .set(auth(manager.token))
      .send({ userId: saraId })
      .expect(201);

    await http(app).get(`/api/cases/${omarCase.id}`).set(auth(sara.token)).expect(200);
    expect(await caseIds(sara.token)).toContain(omarCase.id);

    await http(app)
      .delete(`/api/cases/${omarCase.id}/grants/${grant.body.id}`)
      .set(auth(manager.token))
      .expect(200);

    await http(app).get(`/api/cases/${omarCase.id}`).set(auth(sara.token)).expect(404);
  });
});
