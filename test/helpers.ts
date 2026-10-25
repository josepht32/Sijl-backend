import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

export const PASSWORD = 'Admin123!';

export const ACCOUNTS = {
  admin: 'admin@sijil.local',
  manager: 'layla@sijil.local',
  employee: 'omar@sijil.local',
  legal: 'sara@sijil.local',
  secretariat: 'nora@sijil.local',
  studies: 'fahad@sijil.local',
  technical: 'hind@sijil.local',
  chairman: 'khalid@sijil.local',
} as const;

export type TestApp = {
  app: INestApplication;
  dir: string;
  close: () => Promise<void>;
};

let shared: Promise<TestApp> | null = null;

export function getTestApp(): Promise<TestApp> {
  if (!shared) {
    shared = createTestApp();
  }
  return shared;
}

export async function createTestApp(): Promise<TestApp> {
  const dir = mkdtempSync(join(tmpdir(), 'sijil-e2e-'));
  process.env.SKIP_DEMO_SEED = 'true';
  process.env.DATABASE_PATH = join(dir, 'cases.sqlite');
  process.env.UPLOADS_DIR = join(dir, 'uploads');
  process.env.JWT_SECRET = 'e2e-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return {
    app,
    dir,
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

export async function login(
  app: INestApplication,
  email: string,
  password = PASSWORD,
) {
  const response = await http(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(201);
  return {
    token: response.body.accessToken as string,
    user: response.body.user,
  };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function firstCategoryId(app: INestApplication, token: string) {
  const response = await http(app)
    .get('/api/categories?active=true')
    .set(auth(token))
    .expect(200);
  return response.body[0].id as string;
}

export async function departments(app: INestApplication, token: string) {
  const response = await http(app)
    .get('/api/departments')
    .set(auth(token))
    .expect(200);
  return response.body as Array<{ id: string; nameEn: string }>;
}

export async function users(app: INestApplication, token: string) {
  const response = await http(app)
    .get('/api/users')
    .set(auth(token))
    .expect(200);
  return response.body as Array<{ id: string; email: string }>;
}

export async function createCase(
  app: INestApplication,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const categoryId =
    (overrides.categoryId as string | undefined) ??
    (await firstCategoryId(app, token));
  const response = await http(app)
    .post('/api/cases')
    .set(auth(token))
    .send({
      title: 'Registry correspondence file',
      description: 'Created by the end-to-end suite',
      categoryId,
      type: 'internal',
      direction: 'incoming',
      ...overrides,
    })
    .expect(201);
  return response.body;
}
