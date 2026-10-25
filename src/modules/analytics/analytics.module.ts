import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseMovement } from '../../entities/case-movement.entity';
import { CaseDecision } from '../../entities/case-decision.entity';
import { ExecutionActivity } from '../../entities/execution-activity.entity';
import { Department } from '../../entities/department.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseMovement,
      CaseDecision,
      ExecutionActivity,
      Department,
    ]),
    CasesModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
