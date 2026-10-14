import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resendApiKey', '');
    this.from = this.configService.get<string>(
      'emailFrom',
      'Hookdash <noreply@hookdash.dev>',
    );
    this.appUrl = this.configService.get<string>('appUrl', '');

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email client initialized');
    } else {
      this.resend = null;
      this.logger.warn('RESEND_API_KEY not set — emails will not be sent');
    }
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }

  inviteUrl(inviteToken: string): string {
    return `${this.appUrl}/invite?token=${inviteToken}`;
  }

  async sendInvite(
    email: string,
    workspaceName: string,
    inviteToken: string,
    inviterEmail: string,
  ): Promise<boolean> {
    const subject = `You've been invited to ${workspaceName} on Hookdash`;
    const html = `
      <p>Hi,</p>
      <p><strong>${escapeHtml(inviterEmail)}</strong> has invited you to join the workspace <strong>${escapeHtml(workspaceName)}</strong> on Hookdash.</p>
      <p><a href="${this.inviteUrl(inviteToken)}">Accept Invite</a></p>
      <p>This link will expire in 7 days.</p>
      <p>— Hookdash</p>
    `;

    return this.send(email, subject, html);
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<boolean> {
    const resetLink = `${this.appUrl}/reset-password?token=${resetToken}`;
    const subject = 'Reset your Hookdash password';
    const html = `
      <p>Hi,</p>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetLink}">Reset Password</a></p>
      <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p>— Hookdash</p>
    `;

    return this.send(email, subject, html);
  }

  async sendEmailVerification(
    email: string,
    verificationToken: string,
  ): Promise<boolean> {
    const verifyLink = `${this.appUrl}/verify-email?token=${verificationToken}`;
    const subject = 'Verify your Hookdash email';
    const html = `
      <p>Hi,</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyLink}">Verify Email</a></p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
      <p>— Hookdash</p>
    `;

    return this.send(email, subject, html);
  }

  async sendAlertNotification(
    email: string,
    subject: string,
    body: string,
  ): Promise<boolean> {
    const html = `
      <p>${escapeHtml(body)}</p>
      <p>— Hookdash Alerts</p>
    `;

    return this.send(email, subject, html);
  }

  private async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    if (!this.resend) {
      // Never log the body: it carries reset and verification tokens
      this.logger.warn(`Email not sent (no provider) to ${to}: ${subject}`);
      return false;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${error.message}`);
        return false;
      }
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (err: unknown) {
      this.logger.error(
        `Failed to send email to ${to}: ${(err as Error).message ?? 'Unknown error'}`,
      );
      return false;
    }
  }
}
