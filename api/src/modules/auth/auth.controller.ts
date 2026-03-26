import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Get,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import {
  SignupDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ChangePasswordDto,
  UpdateAvatarDto,
  UpdateNotificationPreferencesDto,
} from './dto/auth.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({
    status: 201,
    description: 'Login successful, returns access token',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 201, description: 'Password reset email sent' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Reset password using a reset token' })
  @ApiResponse({ status: 201, description: 'Password reset successfully' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address using a verification token' })
  @ApiResponse({ status: 201, description: 'Email verified successfully' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Returns the current user profile' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  @ApiResponse({ status: 201, description: 'Password changed successfully' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Patch('avatar')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update avatar URL for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully' })
  updateAvatar(@CurrentUser() user: JwtPayload, @Body() dto: UpdateAvatarDto) {
    return this.authService.updateAvatar(user.sub, dto);
  }

  @Patch('notifications')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Notification preferences updated' })
  updateNotifications(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.authService.updateNotificationPreferences(user.sub, dto);
  }

  @Delete('avatar')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove avatar for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Avatar removed successfully' })
  removeAvatar(@CurrentUser() user: JwtPayload) {
    return this.authService.removeAvatar(user.sub);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({
    status: 200,
    description: 'Redirects to Google OAuth consent screen',
  })
  googleLogin() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Redirects to app with access token',
  })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { email: string };
    const result = await this.authService.findOrCreateOAuthUser({
      email: user.email,
      provider: 'google',
    });
    const appUrl = this.configService.get<string>(
      'appUrl',
      'https://hookdash-web.onrender.com',
    );
    return res.redirect(
      `${appUrl}/auth/callback?token=${result.accessToken}&slug=${result.ingressSlug}`,
    );
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  @ApiResponse({
    status: 200,
    description: 'Redirects to GitHub OAuth consent screen',
  })
  githubLogin() {
    // Passport redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({
    status: 200,
    description: 'Redirects to app with access token',
  })
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { email: string };
    const result = await this.authService.findOrCreateOAuthUser({
      email: user.email,
      provider: 'github',
    });
    const appUrl = this.configService.get<string>(
      'appUrl',
      'https://hookdash-web.onrender.com',
    );
    return res.redirect(
      `${appUrl}/auth/callback?token=${result.accessToken}&slug=${result.ingressSlug}`,
    );
  }
}
