import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseMovement } from '../../entities/case-movement.entity';
import { CaseRelation } from '../../entities/case-relation.entity';
import { Document } from '../../entities/document.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { CasesModule } from '../cases/cases.module';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CaseMovement, CaseRelation, Document]),
    forwardRef(() => CasesModule),
    DocumentsModule,
    AuditModule,
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
