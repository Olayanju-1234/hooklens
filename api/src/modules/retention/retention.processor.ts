import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Job } from 'bullmq';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';

const BATCH_LIMIT = 1000;

@Processor('retention-cleanup', { drainDelay: 30, lockDuration: 60_000 })
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly eventRepo: Repository<WebhookEvent>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
  ) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async process(job: Job): Promise<void> {
    const workspaces = await this.workspaceRepo.find();

    for (const workspace of workspaces) {
      const cutoff = new Date(
        Date.now() - workspace.retentionDays * 86_400_000,
      );
      let totalDeleted = 0;

      while (true) {
        const batch = await this.eventRepo.find({
          select: ['id'],
          where: {
            workspaceId: workspace.id,
            receivedAt: LessThan(cutoff),
          },
          take: BATCH_LIMIT,
        });

        if (batch.length === 0) break;

        const ids = batch.map((e) => e.id);
        await this.eventRepo.delete(ids);
        totalDeleted += ids.length;

        if (batch.length < BATCH_LIMIT) break;
      }

      if (totalDeleted > 0) {
        this.logger.log(
          `Workspace ${workspace.slug}: deleted ${totalDeleted} expired events (retention=${workspace.retentionDays}d)`,
        );
      }
    }
  }
}
