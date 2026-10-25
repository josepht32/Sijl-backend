import { IsString, MinLength } from 'class-validator';

export class SignDocumentDto {
  @IsString()
  @MinLength(80)
  signatureDataUrl: string;
}
