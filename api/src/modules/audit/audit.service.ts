import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity.js';

export interface AuditEntry {
  workspaceId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const log = this.auditRepo.create({
      workspaceId: entry.workspaceId,
      userId: entry.userId ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
    await this.auditRepo.save(log);
  }

  async list(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const [items, total] = await this.auditRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }
}
