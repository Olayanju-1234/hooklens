import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import {
  DeliverJobData,
  deliveryJobOptions,
} from '../forward/forward.processor.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    private readonly endpointsService: EndpointsService,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<DeliverJobData>,
  ) {}

  async list(endpointId: string, userId: string): Promise<DeadLetterEvent[]> {
    await this.endpointsService.findOne(endpointId, userId);
    return this.deadLetterRepo.find({
      where: { endpointId },
      relations: ['event'],
      order: { exhaustedAt: 'DESC' },
    });
  }

  async retry(
    endpointId: string,
    id: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const endpoint = await this.endpointsService.findOne(endpointId, userId);

    const deadLetter = await this.deadLetterRepo.findOne({
      where: { id, endpointId },
    });
    if (!deadLetter) throw new NotFoundException('Dead letter entry not found');

    // Straight to a delivery job for the one target that failed
    await this.forwardQueue.add(
      'deliver',
      {
        eventId: deadLetter.eventId,
        endpointId,
        userId: endpoint.userId,
        destinationId: deadLetter.destinationId ?? null,
      },
      deliveryJobOptions(endpoint),
    );

    await this.deadLetterRepo.remove(deadLetter);
    this.logger.log(
      `Retried dead letter ${id} for event ${deadLetter.eventId}`,
    );
    return { success: true };
  }

  async discard(
    endpointId: string,
    id: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.endpointsService.findOne(endpointId, userId);

    const deadLetter = await this.deadLetterRepo.findOne({
      where: { id, endpointId },
    });
    if (!deadLetter) throw new NotFoundException('Dead letter entry not found');

    await this.deadLetterRepo.remove(deadLetter);
    this.logger.log(`Discarded dead letter ${id}`);
    return { success: true };
  }
}
