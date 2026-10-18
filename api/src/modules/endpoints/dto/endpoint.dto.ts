import {
  IsString,
  IsOptional,
  IsIn,
  IsUrl,
  IsBoolean,
  IsInt,
  IsJSON,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROVIDERS } from '../../../entities/endpoint.entity.js';
import type { Provider } from '../../../entities/endpoint.entity.js';

// Senders treat any non-2xx reply, redirects included, as a failed delivery and retry or disable the webhook
const REPLY_STATUS_MIN = 200;
const REPLY_STATUS_MAX = 299;
// Ingress only replays a JSON object or array (IsJSON's default), so other bodies are rejected up front
const REPLY_BODY_MAX_LENGTH = 4096;

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
    enum: PROVIDERS,
  })
  @IsIn(PROVIDERS)
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

  @ApiPropertyOptional({
    description:
      'HTTP status Hookdash replies to the sender with. Limited to 2xx because senders retry or disable webhooks on anything else. Defaults to 200',
    example: 202,
    default: 200,
    minimum: REPLY_STATUS_MIN,
    maximum: REPLY_STATUS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(REPLY_STATUS_MIN)
  @Max(REPLY_STATUS_MAX)
  responseStatusCode?: number;

  @ApiPropertyOptional({
    description:
      'JSON object or array Hookdash replies to the sender with, as a string. Defaults to {"status":"ok"}',
    example: '{"received":true}',
    maxLength: REPLY_BODY_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(REPLY_BODY_MAX_LENGTH)
  responseBody?: string;

  @ApiPropertyOptional({
    description:
      'Block webhooks whose signature fails verification instead of forwarding them. Needs webhookSecret. Defaults to false',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  blockInvalidSignatures?: boolean;
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
    enum: PROVIDERS,
  })
  @IsOptional()
  @IsIn(PROVIDERS)
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

  @ApiPropertyOptional({
    description:
      'HTTP status Hookdash replies to the sender with. Limited to 2xx because senders retry or disable webhooks on anything else',
    example: 202,
    minimum: REPLY_STATUS_MIN,
    maximum: REPLY_STATUS_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(REPLY_STATUS_MIN)
  @Max(REPLY_STATUS_MAX)
  responseStatusCode?: number;

  @ApiPropertyOptional({
    description:
      'JSON object or array Hookdash replies to the sender with, as a string. Send null to go back to {"status":"ok"}',
    example: '{"received":true}',
    maxLength: REPLY_BODY_MAX_LENGTH,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(REPLY_BODY_MAX_LENGTH)
  responseBody?: string | null;

  @ApiPropertyOptional({
    description:
      'Block webhooks whose signature fails verification instead of forwarding them. Omit to keep the current setting',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  blockInvalidSignatures?: boolean;
}
