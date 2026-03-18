import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  name!: string;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retentionDays?: number;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: 'owner' | 'member';
}
