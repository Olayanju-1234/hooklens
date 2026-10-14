import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { outboundRequestOptions } from '../../../common/utils/outbound-url.js';

export interface SlackMessage {
  webhookUrl: string;
  message: string;
}

@Injectable()
export class SlackSender {
  private readonly logger = new Logger(SlackSender.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async send(webhookUrl: string, message: string): Promise<void> {
    try {
      const guard = await outboundRequestOptions(
        webhookUrl,
        this.configService.get<boolean>('allowPrivateForwarding', false),
      );
      await this.httpService.axiosRef.post(
        webhookUrl,
        {
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
        },
        guard,
      );
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
