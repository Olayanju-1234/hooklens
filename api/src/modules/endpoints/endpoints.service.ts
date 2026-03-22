import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';

@Injectable()
export class EndpointsService {
  private readonly logger = new Logger(EndpointsService.name);

  constructor(
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
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
}
