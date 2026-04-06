import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import { CreateDestinationDto, UpdateDestinationDto } from './dto/destination.dto.js';

@Injectable()
export class EndpointsService {
  private readonly logger = new Logger(EndpointsService.name);

  constructor(
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(ForwardDestination)
    private readonly destinationRepo: Repository<ForwardDestination>,
  ) {}

  async create(
    userId: string,
    dto: CreateEndpointDto,
    workspaceId?: string,
  ): Promise<Endpoint> {
    const endpoint = this.endpointRepo.create({
      userId,
      workspaceId,
      name: dto.name,
      provider: dto.provider,
      forwardUrl: dto.forwardUrl ?? null,
      webhookSecret: dto.webhookSecret ?? null,
      retryMaxAttempts: dto.retryMaxAttempts ?? 3,
      retryBackoffMs: dto.retryBackoffMs ?? 5000,
    });
    const saved = await this.endpointRepo.save(endpoint);
    this.logger.log(`Endpoint created: ${saved.id} for user ${userId}`);
    return saved;
  }

  async findAllByUser(
    userId: string,
    workspaceId?: string,
  ): Promise<Endpoint[]> {
    const where: Record<string, string> = { userId };
    if (workspaceId) where.workspaceId = workspaceId;
    return this.endpointRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Endpoint> {
    const endpoint = await this.endpointRepo.findOne({ where: { id } });
    if (!endpoint) {
      throw new NotFoundException('Endpoint not found');
    }
    if (endpoint.userId !== userId) {
      throw new ForbiddenException();
    }
    return endpoint;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateEndpointDto,
  ): Promise<Endpoint> {
    const endpoint = await this.findOne(id, userId);
    Object.assign(endpoint, dto);
    return this.endpointRepo.save(endpoint);
  }

  async remove(id: string, userId: string): Promise<void> {
    const endpoint = await this.findOne(id, userId);
    await this.endpointRepo.remove(endpoint);
    this.logger.log(`Endpoint deleted: ${id}`);
  }

  // ── Destinations ────────────────────────────────────────────────────────────

  async getDestinations(endpointId: string, userId: string): Promise<ForwardDestination[]> {
    await this.findOne(endpointId, userId); // ownership check
    return this.destinationRepo.find({ where: { endpointId }, order: { createdAt: 'ASC' } });
  }

  async addDestination(endpointId: string, userId: string, dto: CreateDestinationDto): Promise<ForwardDestination> {
    await this.findOne(endpointId, userId); // ownership check
    const destination = this.destinationRepo.create({
      endpointId,
      url: dto.url,
      label: dto.label ?? null,
      isActive: true,
    });
    return this.destinationRepo.save(destination);
  }

  async updateDestination(endpointId: string, destinationId: string, userId: string, dto: UpdateDestinationDto): Promise<ForwardDestination> {
    await this.findOne(endpointId, userId); // ownership check
    const destination = await this.destinationRepo.findOne({ where: { id: destinationId, endpointId } });
    if (!destination) throw new NotFoundException('Destination not found');
    Object.assign(destination, dto);
    return this.destinationRepo.save(destination);
  }

  async removeDestination(endpointId: string, destinationId: string, userId: string): Promise<void> {
    await this.findOne(endpointId, userId); // ownership check
    const destination = await this.destinationRepo.findOne({ where: { id: destinationId, endpointId } });
    if (!destination) throw new NotFoundException('Destination not found');
    await this.destinationRepo.remove(destination);
  }
}
