import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChaosSetting } from '../../entities/chaos-setting.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { EndpointsModule } from '../endpoints/endpoints.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ChaosService } from './chaos.service.js';
import { ChaosController } from './chaos.controller.js';
import { ChaosExpiryProcessor } from './chaos-expiry.processor.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([ChaosSetting, ForwardDestination]),
    BullModule.registerQueue(
      { name: 'webhook-forward' },
      { name: 'chaos-expiry' },
    ),
    EndpointsModule,
    WorkspacesModule,
    AuditModule,
  ],
  controllers: [ChaosController],
  providers: [ChaosService, ChaosExpiryProcessor],
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
