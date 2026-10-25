import './crypto-polyfill';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CasesModule } from './modules/cases/cases.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { RolesModule } from './modules/roles/roles.module';
import { SeedModule } from './database/seed.module';

function sqliteConfig() {
  const database =
    process.env.DATABASE_PATH || join(process.cwd(), 'data', 'cases.sqlite');
  const uploads = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
  mkdirSync(dirname(database), { recursive: true });
  mkdirSync(uploads, { recursive: true });
  return {
    type: 'sqlite' as const,
    database,
    autoLoadEntities: true,
    synchronize: true,
    enableWAL: true,
    busyTimeout: 8000,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: sqliteConfig,
    }),
    AuditModule,
    UsersModule,
    DepartmentsModule,
    AuthModule,
    CategoriesModule,
    CasesModule,
    DocumentsModule,
    WorkflowModule,
    LifecycleModule,
    AnalyticsModule,
    RolesModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
