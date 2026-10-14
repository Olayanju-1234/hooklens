import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey } from '../../entities/api-key.entity.js';
import { CreateApiKeyDto } from './dto/api-key.dto.js';

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ apiKey: Omit<ApiKey, 'keyHash'>; rawKey: string }> {
    const rawKey = `hd_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = this.apiKeyRepo.create({
      workspaceId,
      createdByUserId: userId,
      name: dto.name,
      keyHash,
      keyPrefix,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    const saved = await this.apiKeyRepo.save(apiKey);

    this.logger.log(
      `API key created: ${saved.id} (${keyPrefix}...) in workspace ${workspaceId}`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { keyHash: _hash, ...apiKeyWithoutHash } = saved;
    return { apiKey: apiKeyWithoutHash, rawKey };
  }

  async list(workspaceId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(id: string, workspaceId: string): Promise<{ success: boolean }> {
    const key = await this.apiKeyRepo.findOne({
      where: { id, workspaceId },
    });
    if (!key) throw new NotFoundException('API key not found');

    key.isActive = false;
    await this.apiKeyRepo.save(key);
    this.logger.log(`API key revoked: ${id}`);
    return { success: true };
  }

  async delete(id: string, workspaceId: string): Promise<{ success: boolean }> {
    const key = await this.apiKeyRepo.findOne({
      where: { id, workspaceId },
    });
    if (!key) throw new NotFoundException('API key not found');

    await this.apiKeyRepo.remove(key);
    this.logger.log(`API key deleted: ${id}`);
    return { success: true };
  }

  async validateKey(rawKey: string): Promise<ApiKey | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeyRepo
      .createQueryBuilder('k')
      .addSelect('k.keyHash')
      .where('k.keyHash = :keyHash', { keyHash })
      .andWhere('k.isActive = true')
      .getOne();

    if (!apiKey) return null;

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    // Update lastUsedAt
    await this.apiKeyRepo.update(apiKey.id, { lastUsedAt: new Date() });
    return apiKey;
  }
}
