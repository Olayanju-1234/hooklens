import { IsEmail, IsString, IsUrl, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'User password (min 8 characters)', example: 'secureP@ss1' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'User password', example: 'secureP@ss1' })
  @IsString()
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Email address for password reset', example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token received via email', example: 'abc123token' })
  @IsString()
  token!: string;

  @ApiProperty({ description: 'New password (min 8 characters)', example: 'newSecureP@ss1' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token', example: 'verify-token-123' })
  @IsString()
  token!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'oldP@ss123' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ description: 'New password (min 8 characters)', example: 'newSecureP@ss1' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateAvatarDto {
  @ApiProperty({
    description: 'URL of the avatar image',
    example: 'https://gravatar.com/avatar/abc123',
  })
  @IsUrl()
  avatarUrl!: string;
}
