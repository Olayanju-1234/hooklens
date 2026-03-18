import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';

export class TransformOperationDto {
  @IsString()
  type!: 'rename' | 'remove' | 'set' | 'copy';

  @IsString()
  path!: string;

  @IsOptional()
  @IsString()
  newPath?: string;

  @IsOptional()
  value?: unknown;
}

export class CreateTransformRuleDto {
  @IsString()
  name!: string;

  @IsArray()
  operations!: TransformOperationDto[];

  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class UpdateTransformRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  operations?: TransformOperationDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;
}
