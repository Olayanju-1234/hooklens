import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Workspace name', example: 'My Team Workspace' })
  @IsString()
  name!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({
    description: 'Updated workspace name',
    example: 'Renamed Workspace',
  })
  @IsOptional()
  @IsString()
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
