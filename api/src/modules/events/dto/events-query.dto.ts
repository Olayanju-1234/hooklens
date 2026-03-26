import {
  IsOptional,
  IsUUID,
  IsString,
  IsDateString,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EventsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by endpoint ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @ApiPropertyOptional({
    description: 'Filter by event type',
    example: 'charge.success',
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({
    description: 'Filter by forward status',
    example: 'success',
  })
  @IsOptional()
  @IsString()
  forwardStatus?: string;

  @ApiPropertyOptional({
    description: 'Filter by provider',
    example: 'paystack',
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: 'Search term to filter events',
    example: 'payment',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter duplicate events',
    example: 'false',
    enum: ['true', 'false'],
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  isDuplicate?: string;

  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601)',
    example: '2025-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601)',
    example: '2025-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 'eyJpZCI6IjEyMyJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of results per page (1-100)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
