import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LocalDeliveryDto {
  @ApiProperty({
    description: 'Where the event was delivered',
    example: 'localhost:3000/webhooks',
  })
  @IsString()
  @MaxLength(200)
  target!: string;

  @ApiProperty({ enum: ['forwarded', 'failed'] })
  @IsIn(['forwarded', 'failed'])
  status!: 'forwarded' | 'failed';

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  responseCode?: number;

  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(0)
  @Max(600_000)
  latencyMs!: number;

  @ApiPropertyOptional({ example: 'connect ECONNREFUSED 127.0.0.1:3000' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}
