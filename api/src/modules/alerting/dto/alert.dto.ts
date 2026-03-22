import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsObject,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AlertChannelConfigDto {
  @ApiPropertyOptional({ description: 'Webhook URL for Slack/Discord notifications', example: 'https://hooks.slack.com/services/xxx' })
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Email address for email notifications', example: 'alerts@example.com' })
  @IsOptional()
  @IsString()
  email?: string;
}

export class CreateAlertChannelDto {
  @ApiProperty({ description: 'Notification channel type', example: 'slack', enum: ['slack', 'email', 'discord'] })
  @IsIn(['slack', 'email', 'discord'])
  type!: 'slack' | 'email' | 'discord';

  @ApiProperty({ description: 'Display name for the alert channel', example: 'Engineering Slack' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Channel-specific configuration' })
  @IsObject()
  @ValidateNested()
  @Type(() => AlertChannelConfigDto)
  config!: AlertChannelConfigDto;
}

export class UpdateAlertChannelDto {
  @ApiPropertyOptional({ description: 'Updated channel name', example: 'Renamed Channel' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Updated channel configuration' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AlertChannelConfigDto)
  config?: AlertChannelConfigDto;

  @ApiPropertyOptional({ description: 'Whether the channel is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAlertRuleDto {
  @ApiProperty({ description: 'Alert rule name', example: 'Forward failure alert' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Type of alert trigger', example: 'forward_failure', enum: ['forward_failure', 'signature_failure', 'no_events'] })
  @IsIn(['forward_failure', 'signature_failure', 'no_events'])
  type!: 'forward_failure' | 'signature_failure' | 'no_events';

  @ApiProperty({ description: 'Rule-specific configuration', example: { threshold: 5 } })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiProperty({ description: 'IDs of alert channels to notify', example: ['550e8400-e29b-41d4-a716-446655440000'] })
  @IsArray()
  @IsUUID('4', { each: true })
  channelIds!: string[];
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ description: 'Updated rule name', example: 'Updated alert rule' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Updated alert trigger type', example: 'signature_failure', enum: ['forward_failure', 'signature_failure', 'no_events'] })
  @IsOptional()
  @IsIn(['forward_failure', 'signature_failure', 'no_events'])
  type?: 'forward_failure' | 'signature_failure' | 'no_events';

  @ApiPropertyOptional({ description: 'Updated rule configuration', example: { threshold: 10 } })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Whether the rule is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Updated alert channel IDs', example: ['550e8400-e29b-41d4-a716-446655440000'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  channelIds?: string[];
}
