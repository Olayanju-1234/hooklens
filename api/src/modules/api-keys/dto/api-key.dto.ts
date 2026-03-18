import { IsString, MinLength, IsOptional, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
