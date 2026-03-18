import {
  Controller,
  Post,
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
import { AuthService } from './auth.service.js';
import {
  SignupDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
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
  githubLogin() {
    // Passport redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
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
