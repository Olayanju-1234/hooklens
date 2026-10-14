import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { ForwardJobData } from '../forward/forward.processor.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    private readonly endpointsService: EndpointsService,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
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

    await this.forwardQueue.add(
      'forward',
      {
        eventId: deadLetter.eventId,
        endpointId,
        userId: endpoint.userId,
        destinationId: deadLetter.destinationId ?? undefined,
      },
      {
        attempts: endpoint.retryMaxAttempts + 1,
        backoff: {
          type: 'exponential',
          delay: Math.max(endpoint.retryBackoffMs, 1000),
        },
      },
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
