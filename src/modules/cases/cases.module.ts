import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from '../../entities/case.entity';
import { CaseGrant } from '../../entities/case-grant.entity';
import { CaseConcernedDepartment } from '../../entities/case-concerned-department.entity';
import { CaseMovement } from '../../entities/case-movement.entity';
import { ReferenceSequence } from '../../entities/reference-sequence.entity';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CategoriesModule } from '../categories/categories.module';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Case,
      CaseGrant,
      CaseConcernedDepartment,
      ReferenceSequence,
      CaseMovement,
    ]),
    CategoriesModule,
    DepartmentsModule,
    AuditModule,
  ],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
