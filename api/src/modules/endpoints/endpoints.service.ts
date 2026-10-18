import * as crypto from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import {
  CreateDestinationDto,
  UpdateDestinationDto,
} from './dto/destination.dto.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import {
  assertPublicUrl,
  UnsafeUrlError,
} from '../../common/utils/outbound-url.js';
import { generateSigningSecret } from '../../common/utils/standard-webhooks.js';

function definedOnly<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

@Injectable()
export class EndpointsService {
  private readonly logger = new Logger(EndpointsService.name);

  constructor(
    @InjectRepository(Endpoint)
    private readonly endpointRepo: Repository<Endpoint>,
    @InjectRepository(ForwardDestination)
    private readonly destinationRepo: Repository<ForwardDestination>,
    private readonly workspacesService: WorkspacesService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    userId: string,
    dto: CreateEndpointDto,
    workspaceId?: string,
  ): Promise<Omit<Endpoint, 'signingSecret'>> {
    if (dto.forwardUrl) await this.assertForwardable(dto.forwardUrl);
    const endpoint = this.endpointRepo.create({
      userId,
      workspaceId,
      ingressSlug: `src_${crypto.randomBytes(12).toString('hex')}`,
      name: dto.name,
      provider: dto.provider,
      forwardUrl: dto.forwardUrl ?? null,
      webhookSecret: dto.webhookSecret ?? null,
      signingSecret: generateSigningSecret(),
      retryMaxAttempts: dto.retryMaxAttempts ?? 3,
      retryBackoffMs: dto.retryBackoffMs ?? 5000,
      blockInvalidSignatures: dto.blockInvalidSignatures ?? false,
    });
    const saved = await this.endpointRepo.save(endpoint);
    this.logger.log(`Endpoint created: ${saved.id} for user ${userId}`);
    // Like reads, creation never returns the secret; it has its own endpoint
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { signingSecret: _secret, ...created } = saved;
    return created;
  }

  async findAllByUser(
    userId: string,
    workspaceId?: string,
  ): Promise<Endpoint[]> {
    // WorkspaceGuard has already checked membership, so members share the workspace's endpoints
    return this.endpointRepo.find({
      where: workspaceId ? { workspaceId } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Loads an endpoint the user created or can reach through workspace membership. */
  async findOne(id: string, userId: string): Promise<Endpoint> {
    const endpoint = await this.endpointRepo.findOne({ where: { id } });
    const allowed =
      endpoint &&
      (endpoint.userId === userId ||
        (endpoint.workspaceId &&
          (await this.workspacesService.isMember(
            endpoint.workspaceId,
            userId,
          ))));
    if (!endpoint || !allowed) {
      throw new NotFoundException('Endpoint not found');
    }
    return endpoint;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateEndpointDto,
  ): Promise<Endpoint> {
    const endpoint = await this.findOne(id, userId);
    if (dto.forwardUrl) await this.assertForwardable(dto.forwardUrl);
    const changes = definedOnly(dto);
    if (Object.keys(changes).length > 0) {
      await this.endpointRepo.update(endpoint.id, changes);
    }
    return this.findOne(id, userId);
  }

  async getSigningSecret(
    id: string,
    userId: string,
  ): Promise<{ signingSecret: string }> {
    await this.findOne(id, userId);
    const endpoint = await this.endpointRepo
      .createQueryBuilder('ep')
      .addSelect('ep.signingSecret')
      .where('ep.id = :id', { id })
      .getOneOrFail();
    return { signingSecret: endpoint.signingSecret };
  }

  async rotateSigningSecret(
    id: string,
    userId: string,
  ): Promise<{ signingSecret: string }> {
    await this.findOne(id, userId);
    const signingSecret = generateSigningSecret();
    await this.endpointRepo.update(id, { signingSecret });
    this.logger.log(`Signing secret rotated for endpoint ${id}`);
    return { signingSecret };
  }

  async remove(id: string, userId: string): Promise<void> {
    const endpoint = await this.findOne(id, userId);
    await this.endpointRepo.remove(endpoint);
    this.logger.log(`Endpoint deleted: ${id}`);
  }

  // ── Destinations ────────────────────────────────────────────────────────────

  async getDestinations(
    endpointId: string,
    userId: string,
  ): Promise<ForwardDestination[]> {
    await this.findOne(endpointId, userId);
    return this.destinationRepo.find({
      where: { endpointId },
      order: { createdAt: 'ASC' },
    });
  }

  async addDestination(
    endpointId: string,
    userId: string,
    dto: CreateDestinationDto,
  ): Promise<ForwardDestination> {
    await this.findOne(endpointId, userId);
    await this.assertForwardable(dto.url);
    const destination = this.destinationRepo.create({
      endpointId,
      url: dto.url,
      label: dto.label ?? null,
      isActive: true,
    });
    return this.destinationRepo.save(destination);
  }

  async updateDestination(
    endpointId: string,
    destinationId: string,
    userId: string,
    dto: UpdateDestinationDto,
  ): Promise<ForwardDestination> {
    await this.findOne(endpointId, userId);
    const destination = await this.destinationRepo.findOne({
      where: { id: destinationId, endpointId },
    });
    if (!destination) throw new NotFoundException('Destination not found');
    if (dto.url) await this.assertForwardable(dto.url);
    Object.assign(destination, definedOnly(dto));
    return this.destinationRepo.save(destination);
  }

  async removeDestination(
    endpointId: string,
    destinationId: string,
    userId: string,
  ): Promise<void> {
    await this.findOne(endpointId, userId);
    const destination = await this.destinationRepo.findOne({
      where: { id: destinationId, endpointId },
    });
    if (!destination) throw new NotFoundException('Destination not found');
    await this.destinationRepo.remove(destination);
  }

  private async assertForwardable(url: string): Promise<void> {
    if (this.configService.get<boolean>('allowPrivateForwarding')) return;
    try {
      await assertPublicUrl(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        throw new BadRequestException(`Forward URL rejected: ${err.message}`);
      }
      throw new BadRequestException(
        `Forward URL rejected: could not resolve ${new URL(url).hostname}`,
      );
    }
  }
}
