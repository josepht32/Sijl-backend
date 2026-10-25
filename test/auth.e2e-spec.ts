import { INestApplication } from '@nestjs/common';
import { ACCOUNTS, auth, getTestApp, http, login } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });

  it('reports healthy', async () => {
    await http(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it('rejects unauthenticated access', async () => {
    await http(app).get('/api/auth/me').expect(401);
    await http(app).get('/api/cases').expect(401);
  });

  it('logs in seeded accounts and returns the current user', async () => {
    const { token, user } = await login(app, ACCOUNTS.admin);
    expect(user.email).toBe(ACCOUNTS.admin);
    expect(user.permissions).toEqual(expect.arrayContaining(['cases.create', 'roles.manage']));

    const me = await http(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.email).toBe(ACCOUNTS.admin);
    expect(me.body.nameEn).toBe('Amina El-Sayed');
  });

  it('rejects invalid credentials', async () => {
    await http(app)
      .post('/api/auth/login')
      .send({ email: ACCOUNTS.admin, password: 'WrongPass1' })
      .expect(401);
  });
});
