import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CaseAccessScope,
  CaseDirection,
  CaseStatus,
  CaseType,
  TimelineStatus,
} from '../../../common/enums/case.enums';
import {
  WorkflowStage,
  WorkflowState,
} from '../../../common/enums/workflow.enums';

export class CreateCaseDto {
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsEnum(CaseType)
  type: CaseType;

  @IsEnum(CaseDirection)
  direction: CaseDirection;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsUUID()
  sourceDepartmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  sourceEntity?: string;
}

export class QueryCasesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(CaseType)
  type?: CaseType;

  @IsOptional()
  @IsEnum(CaseDirection)
  direction?: CaseDirection;

  @IsOptional()
  @IsEnum(CaseStatus)
  status?: CaseStatus;

  @IsOptional()
  @IsEnum(TimelineStatus)
  timelineStatus?: TimelineStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(CaseAccessScope)
  scope?: CaseAccessScope;

  @IsOptional()
  @IsEnum(WorkflowStage)
  currentStage?: WorkflowStage;

  @IsOptional()
  @IsEnum(WorkflowState)
  workflowState?: WorkflowState;

  @IsOptional()
  @IsUUID()
  involvedDepartmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inactiveDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class GrantAccessDto {
  @IsUUID()
  userId: string;
}
