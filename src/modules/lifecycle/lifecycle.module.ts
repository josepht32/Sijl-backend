import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseDecision } from '../../entities/case-decision.entity';
import { CaseConcernedDepartment } from '../../entities/case-concerned-department.entity';
import { ExecutionActivity } from '../../entities/execution-activity.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { LifecycleService } from './lifecycle.service';
import { LifecycleController } from './lifecycle.controller';
import { CasesModule } from '../cases/cases.module';
import { DocumentsModule } from '../documents/documents.module';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseDecision,
      CaseConcernedDepartment,
      ExecutionActivity,
      CaseMovement,
    ]),
    CasesModule,
    DocumentsModule,
    DepartmentsModule,
    AuditModule,
  ],
  controllers: [LifecycleController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
