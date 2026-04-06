import { IsString, IsOptional, IsUrl, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDestinationDto {
  @ApiProperty({ example: 'https://api.example.com/webhooks' })
  @IsUrl()
  url!: string;

  @ApiPropertyOptional({ example: 'Production API' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdateDestinationDto {
  @ApiPropertyOptional({ example: 'https://api.example.com/webhooks/v2' })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ example: 'Staging API' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
