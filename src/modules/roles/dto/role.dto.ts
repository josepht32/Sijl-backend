import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Permission } from '../../../common/enums/permission.enum';
import { WorkflowStage } from '../../../common/enums/workflow.enums';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  nameEn: string;

  @IsString()
  @MinLength(2)
  nameAr: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions: Permission[];

  @IsOptional()
  @IsArray()
  @IsEnum(WorkflowStage, { each: true })
  workflowStages?: WorkflowStage[];
}

export class UpdateRoleDto {
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
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  descriptionAr?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];

  @IsOptional()
  @IsArray()
  @IsEnum(WorkflowStage, { each: true })
  workflowStages?: WorkflowStage[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
