import { IsString, IsOptional, IsIn, IsUrl, IsBoolean } from 'class-validator';
import type { Provider } from '../../../entities/endpoint.entity.js';

export class CreateEndpointDto {
  @IsString()
  name!: string;

  @IsIn(['paystack', 'flutterwave', 'mono', 'custom'])
  provider!: Provider;

  @IsOptional()
  @IsUrl()
  forwardUrl?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class UpdateEndpointDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl()
  forwardUrl?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
