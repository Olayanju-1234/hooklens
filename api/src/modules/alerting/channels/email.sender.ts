import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service.js';

@Injectable()
export class EmailSender {
  private readonly logger = new Logger(EmailSender.name);

  constructor(private readonly emailService: EmailService) {}

  async send(email: string, subject: string, body: string): Promise<void> {
    this.logger.log(`Sending email alert to ${email}: ${subject}`);
    await this.emailService.sendAlertNotification(email, subject, body);
  }
}
