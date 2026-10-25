import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { Department } from '../entities/department.entity';
import { User } from '../entities/user.entity';
import { CaseCategory } from '../entities/case-category.entity';
import { Case } from '../entities/case.entity';
import { CaseMovement } from '../entities/case-movement.entity';
import { WorkflowStageAssignment } from '../entities/workflow-stage-assignment.entity';
import { CaseDecision } from '../entities/case-decision.entity';
import { CaseConcernedDepartment } from '../entities/case-concerned-department.entity';
import { ExecutionActivity } from '../entities/execution-activity.entity';
import { Document } from '../entities/document.entity';
import { DocumentDownload } from '../entities/document-download.entity';
import { CaseGrant } from '../entities/case-grant.entity';
import { CaseRelation } from '../entities/case-relation.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { RoleDefinition } from '../entities/role-definition.entity';
import { SeedService } from './seed.service';
import { DemoDatasetSeeder } from './demo-dataset.seeder';
import { RolesModule } from '../modules/roles/roles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      Department,
      User,
      CaseCategory,
      Case,
      CaseMovement,
      WorkflowStageAssignment,
      CaseDecision,
      CaseConcernedDepartment,
      ExecutionActivity,
      Document,
      DocumentDownload,
      CaseGrant,
      CaseRelation,
      AuditLog,
      RoleDefinition,
    ]),
    RolesModule,
  ],
  providers: [SeedService, DemoDatasetSeeder],
})
export class SeedModule {}
