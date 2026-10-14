import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  IsIn,
  IsObject,
  Matches,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Dot paths only; blocks prototype keys so a rule can't reach Object.prototype
const SAFE_PATH =
  /^(?!.*(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$))[^.]+(?:\.[^.]+)*$/;
const SAFE_PATH_MESSAGE =
  'path must be a dot path without __proto__, constructor or prototype segments';

export class TransformOperationDto {
  @ApiProperty({
    description: 'Type of transform operation',
    example: 'rename',
    enum: ['rename', 'remove', 'set', 'copy'],
  })
  @IsIn(['rename', 'remove', 'set', 'copy'])
  type!: 'rename' | 'remove' | 'set' | 'copy';

  @ApiProperty({
    description: 'JSON path of the field to transform',
    example: 'data.amount',
  })
  @IsString()
  @MaxLength(200)
  @Matches(SAFE_PATH, { message: SAFE_PATH_MESSAGE })
  path!: string;

  @ApiPropertyOptional({
    description: 'New path for rename/copy operations',
    example: 'data.total',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(SAFE_PATH, { message: SAFE_PATH_MESSAGE })
  newPath?: string;

  @ApiPropertyOptional({
    description: 'Value to set for set operations',
    example: 'default_value',
  })
  @IsOptional()
  value?: unknown;
}

export class CreateTransformRuleDto {
  @ApiProperty({
    description: 'Transform rule name',
    example: 'Normalize Paystack payload',
  })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'List of transform operations to apply',
    type: [TransformOperationDto],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransformOperationDto)
  operations!: TransformOperationDto[];

  @ApiPropertyOptional({
    description: 'Execution priority (lower runs first)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class UpdateTransformRuleDto {
  @ApiPropertyOptional({
    description: 'Updated rule name',
    example: 'Renamed transform rule',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated list of transform operations',
    type: [TransformOperationDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransformOperationDto)
  operations?: TransformOperationDto[];

  @ApiPropertyOptional({
    description: 'Whether the rule is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Updated execution priority',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;
}

export class TestTransformDto {
  @ApiProperty({
    description: 'Operations to run against the payload',
    type: [TransformOperationDto],
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TransformOperationDto)
  operations!: TransformOperationDto[];

  @ApiProperty({
    description: 'Sample payload',
    example: { data: { amount: 5 } },
  })
  @IsObject()
  body!: Record<string, unknown>;
}
