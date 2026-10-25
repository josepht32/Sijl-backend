import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
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

  @IsInt()
  @Min(1)
  targetTimelineDays: number;

  @IsInt()
  @Min(1)
  retentionPeriodYears: number;
}

export class UpdateCategoryDto {
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
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  targetTimelineDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionPeriodYears?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
