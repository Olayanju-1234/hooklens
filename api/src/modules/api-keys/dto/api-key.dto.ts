import { IsString, MinLength, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Display name for the API key', example: 'Production Key' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Expiration date (ISO 8601)', example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
