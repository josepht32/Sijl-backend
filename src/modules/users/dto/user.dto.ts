import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { WorkflowStage } from '../../../common/enums/workflow.enums';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  nameEn: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsString()
  @MinLength(2)
  role: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(WorkflowStage, { each: true })
  workflowStages?: WorkflowStage[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  role?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(WorkflowStage, { each: true })
  workflowStages?: WorkflowStage[];
}
