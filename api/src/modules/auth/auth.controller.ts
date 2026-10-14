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
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import {
  OAuthGuard,
  isOAuthConfigured,
  type OAuthProvider,
} from './guards/oauth.guard.js';
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
  private readonly logger = new Logger(AuthController.name);

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

  @Get('providers')
  @ApiOperation({ summary: 'List OAuth providers that are configured' })
  @ApiResponse({ status: 200, description: 'Map of provider to enabled flag' })
  oauthProviders() {
    return {
      google: isOAuthConfigured(this.configService, 'google'),
      github: isOAuthConfigured(this.configService, 'github'),
    };
  }

  @Get('google')
  @UseGuards(OAuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google, or back to the app if not configured',
  })
  googleLogin(@Res() res: Response) {
    // Only reached when Google OAuth is not configured
    return res.redirect(this.loginErrorUrl('oauth_unavailable'));
  }

  @Get('google/callback')
  @UseGuards(OAuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to app with access token',
  })
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.completeOAuth(req, res, 'google');
  }

  @Get('github')
  @UseGuards(OAuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to GitHub, or back to the app if not configured',
  })
  githubLogin(@Res() res: Response) {
    // Only reached when GitHub OAuth is not configured
    return res.redirect(this.loginErrorUrl('oauth_unavailable'));
  }

  @Get('github/callback')
  @UseGuards(OAuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to app with access token',
  })
  githubCallback(@Req() req: Request, @Res() res: Response) {
    return this.completeOAuth(req, res, 'github');
  }

  private async completeOAuth(
    req: Request,
    res: Response,
    provider: OAuthProvider,
  ) {
    const user = req.user as { email?: string } | null | undefined;
    if (!user?.email) {
      return res.redirect(this.loginErrorUrl('oauth_failed'));
    }

    try {
      const result = await this.authService.findOrCreateOAuthUser({
        email: user.email,
        provider,
      });
      // Fragment keeps the token out of server and proxy access logs
      const params = new URLSearchParams({
        token: result.accessToken,
        slug: result.ingressSlug,
      });
      return res.redirect(
        `${this.appUrl()}/auth/callback#${params.toString()}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `OAuth ${provider} sign-in failed: ${(err as Error).message}`,
      );
      return res.redirect(this.loginErrorUrl('oauth_failed'));
    }
  }

  private appUrl(): string {
    return this.configService.get<string>('appUrl', '');
  }

  private loginErrorUrl(code: string): string {
    return `${this.appUrl()}/login?error=${code}`;
  }
}
