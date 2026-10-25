import { INestApplication } from '@nestjs/common';
import { getTestApp, http } from './helpers';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await getTestApp()).app;
  });

  it('/api/health (GET)', async () => {
    await http(app).get('/api/health').expect(200).expect({ status: 'ok' });
  });
});
