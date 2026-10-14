import {
  IsString,
  IsOptional,
  IsIn,
  IsUrl,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Provider } from '../../../entities/endpoint.entity.js';

export class CreateEndpointDto {
  @ApiProperty({
    description: 'Name of the endpoint',
    example: 'My Paystack Webhook',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Webhook provider',
    example: 'paystack',
    enum: ['stripe', 'paystack', 'flutterwave', 'mono', 'bags', 'custom'],
  })
  @IsIn(['stripe', 'paystack', 'flutterwave', 'mono', 'bags', 'custom'])
  provider!: Provider;

  @ApiPropertyOptional({
    description: 'URL to forward incoming webhooks to',
    example: 'https://api.example.com/webhooks',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  forwardUrl?: string;

  @ApiPropertyOptional({
    description: 'Secret used for webhook signature verification',
    example: 'whsec_abc123',
  })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of retry attempts',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryMaxAttempts?: number;

  @ApiPropertyOptional({
    description: 'Backoff delay in milliseconds between retries',
    example: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  retryBackoffMs?: number;
}

export class UpdateEndpointDto {
  @ApiPropertyOptional({
    description: 'Updated endpoint name',
    example: 'Renamed Webhook',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Webhook provider',
    example: 'stripe',
    enum: ['stripe', 'paystack', 'flutterwave', 'mono', 'bags', 'custom'],
  })
  @IsOptional()
  @IsIn(['stripe', 'paystack', 'flutterwave', 'mono', 'bags', 'custom'])
  provider?: Provider;

  @ApiPropertyOptional({
    description: 'Updated forward URL',
    example: 'https://api.example.com/webhooks/v2',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  forwardUrl?: string;

  @ApiPropertyOptional({
    description: 'Updated webhook secret',
    example: 'whsec_new456',
  })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({
    description: 'Whether the endpoint is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Maximum number of retry attempts',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryMaxAttempts?: number;

  @ApiPropertyOptional({
    description: 'Backoff delay in milliseconds between retries',
    example: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  retryBackoffMs?: number;
}
