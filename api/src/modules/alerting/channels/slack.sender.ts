import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

export interface SlackMessage {
  webhookUrl: string;
  message: string;
}

@Injectable()
export class SlackSender {
  private readonly logger = new Logger(SlackSender.name);

  constructor(private readonly httpService: HttpService) {}

  async send(webhookUrl: string, message: string): Promise<void> {
    try {
      await this.httpService.axiosRef.post(webhookUrl, {
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message,
            },
          },
        ],
      });
      this.logger.log(
        `Slack notification sent to ${webhookUrl.slice(0, 40)}...`,
      );
    } catch (err: unknown) {
      const error = err as { message?: string };
      this.logger.error(
        `Slack notification failed: ${error.message ?? 'Unknown error'}`,
      );
      throw err;
    }
  }
}
