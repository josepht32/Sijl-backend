import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ComposeDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8_000_000)
  html: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsBoolean()
  rtl?: boolean;
}
