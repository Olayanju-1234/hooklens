import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ChaosService } from './chaos.service.js';

@Processor('chaos-expiry', { drainDelay: 30, lockDuration: 30_000 })
export class ChaosExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ChaosExpiryProcessor.name);

  constructor(private readonly chaosService: ChaosService) {
    super();
  }

  async process(): Promise<void> {
    const expired = await this.chaosService.expireDue();
    if (expired > 0) {
      this.logger.log(`Switched off ${expired} expired chaos setting(s)`);
    }
  }
}
