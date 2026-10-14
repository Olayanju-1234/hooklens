import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { outboundRequestOptions } from '../../../common/utils/outbound-url.js';

@Injectable()
export class DiscordSender {
  private readonly logger = new Logger(DiscordSender.name);

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
          content: message,
        },
        guard,
      );
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
