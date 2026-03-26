import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardJobData } from '../forward/forward.processor.js';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue<ForwardJobData>,
  ) {}

  async list(endpointId: string, userId: string): Promise<DeadLetterEvent[]> {
    // Verify ownership
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    return this.deadLetterRepo.find({
      where: { endpointId },
      relations: ['event'],
      order: { exhaustedAt: 'DESC' },
    });
  }

  async retry(endpointId: string, id: string, userId: string): Promise<void> {
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    const deadLetter = await this.deadLetterRepo.findOne({
      where: { id, endpointId },
    });
    if (!deadLetter) throw new NotFoundException('Dead letter entry not found');

    await this.forwardQueue.add('forward', {
      eventId: deadLetter.eventId,
      endpointId,
      userId,
      destinationId: deadLetter.destinationId ?? undefined,
    });

    await this.deadLetterRepo.remove(deadLetter);
    this.logger.log(
      `Retried dead letter ${id} for event ${deadLetter.eventId}`,
    );
  }

  async discard(endpointId: string, id: string, userId: string): Promise<void> {
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) throw new NotFoundException('Endpoint not found');

    const deadLetter = await this.deadLetterRepo.findOne({
      where: { id, endpointId },
    });
    if (!deadLetter) throw new NotFoundException('Dead letter entry not found');

    await this.deadLetterRepo.remove(deadLetter);
    this.logger.log(`Discarded dead letter ${id}`);
  }
}
