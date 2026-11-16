import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CHAOS_SCOPES,
  type ChaosScope,
} from '../../../entities/chaos-setting.entity.js';

export class UpdateChaosDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Chaos switches itself off after this many minutes',
    minimum: 1,
    maximum: 1440,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({
    enum: CHAOS_SCOPES,
    description:
      '`test` touches only events sent from test payloads; `all` also touches real provider traffic (workspace owner only)',
  })
  @IsOptional()
  @IsIn(CHAOS_SCOPES)
  scope?: ChaosScope;

  @ApiPropertyOptional({
    example: 'run-42',
    description: 'Same seed, same chaos plan for the same event',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    message: 'seed must be 1-64 letters, digits, - or _',
  })
  seed?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  duplicateProbability?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 3, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  duplicateCopies?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 300_000, example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300_000)
  duplicateGapMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  delayProbability?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 900_000, example: 30_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900_000)
  delayMinMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 900_000, example: 120_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900_000)
  delayMaxMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  reorderProbability?: number;

  @ApiPropertyOptional({ minimum: 1000, maximum: 300_000, example: 10_000 })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300_000)
  reorderWindowMs?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  staleProbability?: number;
}
