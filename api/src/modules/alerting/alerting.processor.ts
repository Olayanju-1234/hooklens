import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { AlertRule } from '../../entities/alert-rule.entity.js';
import { AlertingService } from './alerting.service.js';

export interface AlertCheckJobData {
  type: 'scheduled_no_events';
}

@Processor('alert-check')
export class AlertingProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertingProcessor.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly ruleRepo: Repository<AlertRule>,
    private readonly alertingService: AlertingService,
  ) {
    super();
  }

  async process(job: Job<AlertCheckJobData>): Promise<void> {
    this.logger.log(`Processing alert-check job: ${job.id} (${job.data.type})`);

    if (job.data.type !== 'scheduled_no_events') {
      this.logger.warn(
        `Unknown alert-check job type: ${String(job.data.type)}`,
      );
      return;
    }

    try {
      const activeRules = await this.ruleRepo.find({
        where: { type: 'no_events', isActive: true },
      });

      const workspaceIds = [...new Set(activeRules.map((r) => r.workspaceId))];

      this.logger.log(
        `Evaluating no_events rules for ${workspaceIds.length} workspace(s)`,
      );

      await Promise.all(
        workspaceIds.map((wsId) =>
          this.alertingService.evaluateNoEvents(wsId).catch((err: unknown) => {
            const error = err as { message?: string };
            this.logger.error(
              `No-events evaluation failed for workspace ${wsId}: ${error.message ?? 'Unknown error'}`,
            );
          }),
        ),
      );

      this.logger.log('Alert-check job completed');
    } catch (err: unknown) {
      const error = err as { message?: string };
      this.logger.error(
        `Alert-check job failed: ${error.message ?? 'Unknown error'}`,
      );
      throw err;
    }
  }
}
