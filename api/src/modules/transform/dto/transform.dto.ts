import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransformOperationDto {
  @ApiProperty({
    description: 'Type of transform operation',
    example: 'rename',
    enum: ['rename', 'remove', 'set', 'copy'],
  })
  @IsString()
  type!: 'rename' | 'remove' | 'set' | 'copy';

  @ApiProperty({
    description: 'JSON path of the field to transform',
    example: 'data.amount',
  })
  @IsString()
  path!: string;

  @ApiPropertyOptional({
    description: 'New path for rename/copy operations',
    example: 'data.total',
  })
  @IsOptional()
  @IsString()
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
  name!: string;

  @ApiProperty({
    description: 'List of transform operations to apply',
    type: [TransformOperationDto],
  })
  @IsArray()
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
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated list of transform operations',
    type: [TransformOperationDto],
  })
  @IsOptional()
  @IsArray()
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
