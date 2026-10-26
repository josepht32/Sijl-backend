import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DecisionType } from '../../../common/enums/decision.enums';

function toStringArray(value: unknown): string[] {
  if (value == null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [String(value)];
}

export class CreateDecisionDto {
  @IsEnum(DecisionType)
  type: DecisionType;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instruction: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsUUID('4', { each: true })
  departmentIds?: string[];
}

export class CreateActivityDto {
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  comment: string;
}

export class CompleteCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  note?: string;
}

export class AssignDepartmentDto {
  @IsUUID()
  departmentId: string;
}
