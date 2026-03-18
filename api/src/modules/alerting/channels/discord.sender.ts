import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class DiscordSender {
  private readonly logger = new Logger(DiscordSender.name);

  constructor(private readonly httpService: HttpService) {}

  async send(webhookUrl: string, message: string): Promise<void> {
    try {
      await this.httpService.axiosRef.post(webhookUrl, {
        content: message,
      });
      this.logger.log(
        `Discord notification sent to ${webhookUrl.slice(0, 40)}...`,
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      this.logger.error(
        `Discord notification failed: ${error.message ?? 'Unknown error'}`,
      );
      throw err;
    }
  }
}
