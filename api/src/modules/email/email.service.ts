import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resendApiKey', '');
    this.from = this.configService.get<string>(
      'emailFrom',
      'Hookdash <noreply@hookdash.dev>',
    );

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email client initialized');
    } else {
      this.resend = null;
      this.logger.warn(
        'RESEND_API_KEY not set — emails will be logged instead of sent',
      );
    }
  }

  async sendInvite(
    email: string,
    workspaceName: string,
    inviteToken: string,
    inviterEmail: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>(
      'appUrl',
      'https://hookdash-web.onrender.com',
    );
    const inviteLink = `${appUrl}/invite/${inviteToken}`;
    const subject = `You've been invited to ${workspaceName} on Hookdash`;
    const html = `
      <p>Hi,</p>
      <p><strong>${inviterEmail}</strong> has invited you to join the workspace <strong>${workspaceName}</strong> on Hookdash.</p>
      <p><a href="${inviteLink}">Accept Invite</a></p>
      <p>This link will expire in 7 days.</p>
      <p>— Hookdash</p>
    `;

    await this.send(email, subject, html);
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<void> {
    const appUrl = this.configService.get<string>(
      'appUrl',
      'https://hookdash-web.onrender.com',
    );
    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
    const subject = 'Reset your Hookdash password';
    const html = `
      <p>Hi,</p>
      <p>We received a request to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetLink}">Reset Password</a></p>
      <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p>— Hookdash</p>
    `;

    await this.send(email, subject, html);
  }

  async sendEmailVerification(
    email: string,
    verificationToken: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>(
      'appUrl',
      'https://hookdash-web.onrender.com',
    );
    const verifyLink = `${appUrl}/verify-email?token=${verificationToken}`;
    const subject = 'Verify your Hookdash email';
    const html = `
      <p>Hi,</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verifyLink}">Verify Email</a></p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
      <p>— Hookdash</p>
    `;

    await this.send(email, subject, html);
  }

  async sendAlertNotification(
    email: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const html = `
      <p>${body}</p>
      <p>— Hookdash Alerts</p>
    `;

    await this.send(email, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(
        `[Dev Email] To: ${to}, Subject: ${subject}, Body: ${html}`,
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err: unknown) {
      const error = err as { message?: string };
      this.logger.error(
        `Failed to send email to ${to}: ${error.message ?? 'Unknown error'}`,
      );
    }
  }
}
