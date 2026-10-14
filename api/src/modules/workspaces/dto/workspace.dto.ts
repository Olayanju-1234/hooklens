import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const WORKSPACE_NAME_MAX_LENGTH = 100;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWorkspaceDto {
  @ApiProperty({
    description: 'Workspace name',
    example: 'My Team Workspace',
    maxLength: WORKSPACE_NAME_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(WORKSPACE_NAME_MAX_LENGTH)
  name!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({
    description: 'Updated workspace name',
    example: 'Renamed Workspace',
    maxLength: WORKSPACE_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(WORKSPACE_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    description: 'Data retention period in days (1-365)',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;
}

export class InviteMemberDto {
  @ApiProperty({
    description: 'Email address of the user to invite',
    example: 'teammate@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: 'Role to assign to the invited user',
    example: 'member',
    enum: ['owner', 'member'],
  })
  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: 'owner' | 'member';
}
