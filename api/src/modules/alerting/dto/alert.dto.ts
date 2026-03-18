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

export class AlertChannelConfigDto {
  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export class CreateAlertChannelDto {
  @IsIn(['slack', 'email', 'discord'])
  type!: 'slack' | 'email' | 'discord';

  @IsString()
  name!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => AlertChannelConfigDto)
  config!: AlertChannelConfigDto;
}

export class UpdateAlertChannelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AlertChannelConfigDto)
  config?: AlertChannelConfigDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAlertRuleDto {
  @IsString()
  name!: string;

  @IsIn(['forward_failure', 'signature_failure', 'no_events'])
  type!: 'forward_failure' | 'signature_failure' | 'no_events';

  @IsObject()
  config!: Record<string, unknown>;

  @IsArray()
  @IsUUID('4', { each: true })
  channelIds!: string[];
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['forward_failure', 'signature_failure', 'no_events'])
  type?: 'forward_failure' | 'signature_failure' | 'no_events';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  channelIds?: string[];
}
