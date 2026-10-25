import { IsDateString, IsOptional } from 'class-validator';

export class AnalyticsPeriodDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
