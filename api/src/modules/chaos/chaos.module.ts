import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChaosSetting } from '../../entities/chaos-setting.entity.js';
import { ChaosRun } from '../../entities/chaos-run.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { EndpointsModule } from '../endpoints/endpoints.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IngressModule } from '../ingress/ingress.module.js';
import { TestPayloadsModule } from '../test-payloads/test-payloads.module.js';
import { ChaosService } from './chaos.service.js';
import { ChaosController } from './chaos.controller.js';
import { ChaosExpiryProcessor } from './chaos-expiry.processor.js';
import { ChaosRunsService } from './chaos-runs.service.js';
import { ChaosRunsController } from './chaos-runs.controller.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      ChaosSetting,
      ChaosRun,
      ForwardDestination,
      ForwardResult,
      WebhookEvent,
    ]),
    BullModule.registerQueue(
      { name: 'webhook-forward' },
      { name: 'chaos-expiry' },
    ),
    EndpointsModule,
    WorkspacesModule,
    AuditModule,
    IngressModule,
    TestPayloadsModule,
  ],
  controllers: [ChaosController, ChaosRunsController],
  providers: [ChaosService, ChaosRunsService, ChaosExpiryProcessor],
  exports: [ChaosService],
})
export class ChaosModule implements OnModuleInit {
  private readonly logger = new Logger(ChaosModule.name);

  constructor(
    @InjectQueue('chaos-expiry') private readonly expiryQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.expiryQueue.upsertJobScheduler(
        'chaos-expiry-sweep',
        { every: 60_000 },
        { name: 'sweep', opts: { removeOnComplete: true, removeOnFail: 20 } },
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to schedule the chaos expiry sweep: ${(err as Error).message}`,
      );
    }
  }
}
