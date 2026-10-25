import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ReturnTarget } from '../../../common/enums/workflow.enums';

export class ForwardCaseDto {
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instruction: string;
}

export class ReturnCaseDto {
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instruction: string;

  @IsEnum(ReturnTarget)
  returnTo: ReturnTarget;
}

export class ResubmitCaseDto {
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instruction: string;
}

export class CreateRelationDto {
  @IsIn(['case', 'document'])
  type: 'case' | 'document';

  @IsOptional()
  @IsUUID()
  relatedCaseId?: string;

  @IsOptional()
  @IsUUID()
  relatedDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
