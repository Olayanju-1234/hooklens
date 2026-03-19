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
    action?: string,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const qb = this.auditRepo
      .createQueryBuilder('audit')
      .where('audit.workspaceId = :workspaceId', { workspaceId });

    if (action) {
      qb.andWhere('LOWER(audit.action) LIKE :action', {
        action: `%${action.toLowerCase()}%`,
      });
    }

    qb.orderBy('audit.createdAt', 'DESC').skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
