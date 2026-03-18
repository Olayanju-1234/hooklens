import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailSender {
  private readonly logger = new Logger(EmailSender.name);

  send(email: string, subject: string, body: string): void {
    this.logger.log(
      `[Email Alert] To: ${email}, Subject: ${subject}, Body: ${body}`,
    );
  }
}
