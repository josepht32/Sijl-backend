import { INestApplication } from '@nestjs/common';
import {
  ACCOUNTS,
  auth,
  createCase,
  getTestApp,
  firstCategoryId,
  http,
  login,
} from './helpers';

describe('Validations (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let employeeToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = (await getTestApp()).app;
    adminToken = (await login(app, ACCOUNTS.admin)).token;
    employeeToken = (await login(app, ACCOUNTS.employee)).token;
    categoryId = await firstCategoryId(app, adminToken);
  });

  it('validates login payloads', async () => {
    await http(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'Admin123!' }).expect(400);
    await http(app).post('/api/auth/login').send({ email: ACCOUNTS.admin, password: '123' }).expect(400);
    await http(app)
      .post('/api/auth/login')
      .send({ email: ACCOUNTS.admin, password: 'Admin123!', extra: true })
      .expect(400);
  });

  it('validates case creation', async () => {
    await http(app)
      .post('/api/cases')
      .set(auth(employeeToken))
      .send({
        title: 'ab',
        categoryId,
        type: 'internal',
        direction: 'incoming',
      })
      .expect(400);

    await http(app)
      .post('/api/cases')
      .set(auth(employeeToken))
      .send({
        title: 'Valid title',
        categoryId: 'not-a-uuid',
        type: 'internal',
        direction: 'incoming',
      })
      .expect(400);

    await http(app)
      .post('/api/cases')
      .set(auth(employeeToken))
      .send({
        title: 'Valid title',
        categoryId,
        type: 'unknown',
        direction: 'incoming',
      })
      .expect(400);
  });

  it('validates workflow instructions', async () => {
    const created = await createCase(app, employeeToken, {
      title: 'Validation workflow file',
    });
    const secretariat = (await login(app, ACCOUNTS.secretariat)).token;

    await http(app)
      .post(`/api/cases/${created.id}/forward`)
      .set(auth(secretariat))
      .field('instruction', 'too short')
      .expect(400);

    await http(app)
      .post(`/api/cases/${created.id}/return`)
      .set(auth(secretariat))
      .field('instruction', 'Please supply the missing annexes.')
      .expect(400);
  });

  it('validates catalog and people payloads', async () => {
    await http(app)
      .post('/api/categories')
      .set(auth(adminToken))
      .send({
        nameEn: 'A',
        nameAr: 'ب',
        targetTimelineDays: 3,
        retentionPeriodYears: 5,
      })
      .expect(400);

    await http(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: 'new.user@sijil.local',
        password: 'short',
        nameEn: 'New',
        nameAr: 'جديد',
        role: 'employee',
      })
      .expect(400);
  });
});
