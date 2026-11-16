import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { isUUID } from 'class-validator';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import {
  ChaosSetting,
  type ChaosScope,
} from '../../entities/chaos-setting.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import type { Endpoint } from '../../entities/endpoint.entity.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  MAX_EXTRAS_PER_WORKSPACE_MINUTE,
  type ChaosFaults,
} from './chaos-plan.js';
import type { UpdateChaosDto } from './dto/chaos.dto.js';

export const FALLBACK_TARGET = 'fallback';
export const DEFAULT_CHAOS_MINUTES = 30;

const FAULT_FIELDS = [
  'duplicateProbability',
  'duplicateCopies',
  'duplicateGapMs',
  'delayProbability',
  'delayMinMs',
  'delayMaxMs',
  'reorderProbability',
  'reorderWindowMs',
  'staleProbability',
] as const satisfies readonly (keyof ChaosFaults)[];

const PROBABILITIES = [
  'duplicateProbability',
  'delayProbability',
  'reorderProbability',
  'staleProbability',
] as const satisfies readonly (keyof ChaosFaults)[];

export const DEFAULT_FAULTS: ChaosFaults = {
  duplicateProbability: 0,
  duplicateCopies: 1,
  duplicateGapMs: 5000,
  delayProbability: 0,
  delayMinMs: 30_000,
  delayMaxMs: 120_000,
  reorderProbability: 0,
  reorderWindowMs: 10_000,
  staleProbability: 0,
};

export interface ChaosSettingView extends ChaosFaults {
  id: string;
  target: string;
  destinationId: string | null;
  enabled: boolean;
  active: boolean;
  expiresAt: string | null;
  scope: ChaosScope;
  seed: string;
  updatedAt: string;
}

export interface ChaosTargetView {
  target: string;
  destinationId: string | null;
  label: string;
  url: string;
  chaos: ChaosSettingView | null;
}

type ChaosAction =
  | 'chaos.enable'
  | 'chaos.update'
  | 'chaos.disable'
  | 'chaos.expire';

export function isChaosActive(
  setting: Pick<ChaosSetting, 'enabled' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return Boolean(
    setting.enabled && setting.expiresAt && setting.expiresAt > now,
  );
}

function pickFaults(
  source: Partial<Record<keyof ChaosFaults, number | undefined>> | null,
): Partial<ChaosFaults> {
  const out: Partial<ChaosFaults> = {};
  for (const field of FAULT_FIELDS) {
    const value = source?.[field];
    if (typeof value === 'number') out[field] = value;
  }
  return out;
}

@Injectable()
export class ChaosService {
  private readonly logger = new Logger(ChaosService.name);

  constructor(
    @InjectRepository(ChaosSetting)
    private readonly settingRepo: Repository<ChaosSetting>,
    @InjectRepository(ForwardDestination)
    private readonly destinationRepo: Repository<ForwardDestination>,
    private readonly endpointsService: EndpointsService,
    private readonly workspacesService: WorkspacesService,
    private readonly auditService: AuditService,
    @InjectQueue('webhook-forward')
    private readonly forwardQueue: Queue,
  ) {}

  /** Every delivery target of an endpoint with its chaos settings, if any. */
  async list(endpointId: string, userId: string): Promise<ChaosTargetView[]> {
    const endpoint = await this.endpointsService.findOne(endpointId, userId);
    const [destinations, settings] = await Promise.all([
      this.destinationRepo.find({
        where: { endpointId },
        order: { createdAt: 'ASC' },
      }),
      this.settingRepo.find({ where: { endpointId } }),
    ]);
    const byTarget = new Map(
      settings.map((s) => [s.destinationId ?? FALLBACK_TARGET, s]),
    );
    const view = (target: string) => {
      const setting = byTarget.get(target);
      return setting ? this.toView(setting) : null;
    };

    const targets: ChaosTargetView[] = destinations.map((d) => ({
      target: d.id,
      destinationId: d.id,
      label: d.label || d.url,
      url: d.url,
      chaos: view(d.id),
    }));
    if (endpoint.forwardUrl) {
      targets.push({
        target: FALLBACK_TARGET,
        destinationId: null,
        label: 'forward URL',
        url: endpoint.forwardUrl,
        chaos: view(FALLBACK_TARGET),
      });
    }
    return targets;
  }

  async upsert(
    endpointId: string,
    target: string,
    userId: string,
    dto: UpdateChaosDto,
  ): Promise<ChaosSettingView> {
    const { endpoint, destinationId } = await this.resolveTarget(
      endpointId,
      target,
      userId,
    );
    const existing = await this.findSetting(endpointId, destinationId);

    const faults: ChaosFaults = {
      ...DEFAULT_FAULTS,
      ...pickFaults(existing),
      ...pickFaults(dto),
    };
    if (faults.delayMinMs > faults.delayMaxMs) {
      throw new BadRequestException(
        'delayMinMs must not be greater than delayMaxMs',
      );
    }
    if (dto.enabled && PROBABILITIES.every((p) => faults[p] === 0)) {
      throw new BadRequestException(
        'Turn on at least one fault: set a probability above 0',
      );
    }
    const scope = dto.scope ?? existing?.scope ?? 'test';
    if (dto.enabled && scope === 'all') {
      await this.workspacesService.assertOwner(endpoint.workspaceId, userId);
    }

    const wasActive = existing ? isChaosActive(existing) : false;
    const minutes = dto.durationMinutes ?? DEFAULT_CHAOS_MINUTES;
    const setting =
      existing ??
      this.settingRepo.create({
        workspaceId: endpoint.workspaceId,
        endpointId,
        destinationId,
      });
    Object.assign(setting, faults, {
      scope,
      seed: dto.seed ?? existing?.seed ?? randomBytes(8).toString('hex'),
      enabled: dto.enabled,
      expiresAt: dto.enabled ? new Date(Date.now() + minutes * 60_000) : null,
      updatedBy: userId,
    });
    const saved = await this.settingRepo.save(setting);

    const action: ChaosAction = dto.enabled
      ? wasActive
        ? 'chaos.update'
        : 'chaos.enable'
      : wasActive
        ? 'chaos.disable'
        : 'chaos.update';
    await this.audit(saved, userId, action);
    return this.toView(saved);
  }

  async disable(
    endpointId: string,
    target: string,
    userId: string,
  ): Promise<void> {
    const { destinationId } = await this.resolveTarget(
      endpointId,
      target,
      userId,
    );
    const existing = await this.findSetting(endpointId, destinationId);
    if (!existing?.enabled) return;

    existing.enabled = false;
    existing.expiresAt = null;
    existing.updatedBy = userId;
    const saved = await this.settingRepo.save(existing);
    await this.audit(saved, userId, 'chaos.disable');
  }

  /** Settings that are on and not expired, for fan-out. */
  activeForEndpoint(endpointId: string): Promise<ChaosSetting[]> {
    return this.settingRepo.find({
      where: { endpointId, enabled: true, expiresAt: MoreThan(new Date()) },
    });
  }

  /** Checked again just before an extra copy goes out, so switching chaos off cancels copies not yet sent. */
  isActive(endpointId: string, destinationId: string | null): Promise<boolean> {
    return this.settingRepo.exists({
      where: {
        endpointId,
        destinationId: destinationId ?? IsNull(),
        enabled: true,
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /** Grants up to `wanted` extra deliveries within the workspace's per-minute budget; 0 if Redis fails. */
  async reserveExtras(workspaceId: string, wanted: number): Promise<number> {
    if (wanted <= 0) return 0;
    const key = `chaos:extras:${workspaceId}:${Math.floor(Date.now() / 60_000)}`;
    try {
      const redis = await this.forwardQueue.client;
      const replies = await redis
        .multi()
        .incrby(key, wanted)
        .expire(key, 120)
        .exec();
      const total = Number(replies?.[0]?.[1]);
      if (!Number.isFinite(total)) return 0;
      const granted = Math.max(
        0,
        Math.min(wanted, MAX_EXTRAS_PER_WORKSPACE_MINUTE - (total - wanted)),
      );
      if (granted < wanted) await redis.decrby(key, wanted - granted);
      return granted;
    } catch (err) {
      this.logger.warn(
        `Chaos budget check failed for workspace ${workspaceId}, sending no extra copies: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /** Switches off settings whose time ran out and records it in the audit log. */
  async expireDue(): Promise<number> {
    const now = new Date();
    const due = await this.settingRepo.find({
      where: { enabled: true, expiresAt: LessThanOrEqual(now) },
    });
    if (due.length === 0) return 0;

    // The expiry condition is repeated so a setting re-enabled meanwhile stays on
    await Promise.all(
      due.map((s) =>
        this.settingRepo.update(
          { id: s.id, enabled: true, expiresAt: LessThanOrEqual(now) },
          { enabled: false },
        ),
      ),
    );
    await Promise.all(due.map((s) => this.audit(s, null, 'chaos.expire')));
    return due.length;
  }

  private async resolveTarget(
    endpointId: string,
    target: string,
    userId: string,
  ): Promise<{ endpoint: Endpoint; destinationId: string | null }> {
    const endpoint = await this.endpointsService.findOne(endpointId, userId);
    if (target === FALLBACK_TARGET) {
      if (!endpoint.forwardUrl) {
        throw new BadRequestException('This source has no forward URL');
      }
      return { endpoint, destinationId: null };
    }
    if (!isUUID(target)) {
      throw new BadRequestException(
        `Target must be a destination id or "${FALLBACK_TARGET}"`,
      );
    }
    const destination = await this.destinationRepo.findOne({
      where: { id: target, endpointId },
    });
    if (!destination) throw new NotFoundException('Destination not found');
    return { endpoint, destinationId: destination.id };
  }

  private findSetting(
    endpointId: string,
    destinationId: string | null,
  ): Promise<ChaosSetting | null> {
    return this.settingRepo.findOne({
      where: { endpointId, destinationId: destinationId ?? IsNull() },
    });
  }

  private toView(setting: ChaosSetting): ChaosSettingView {
    return {
      id: setting.id,
      target: setting.destinationId ?? FALLBACK_TARGET,
      destinationId: setting.destinationId,
      enabled: setting.enabled,
      active: isChaosActive(setting),
      expiresAt: setting.expiresAt?.toISOString() ?? null,
      scope: setting.scope,
      seed: setting.seed,
      updatedAt: setting.updatedAt?.toISOString() ?? new Date().toISOString(),
      ...DEFAULT_FAULTS,
      ...pickFaults(setting),
    };
  }

  private async audit(
    setting: ChaosSetting,
    userId: string | null,
    action: ChaosAction,
  ): Promise<void> {
    try {
      await this.auditService.log({
        workspaceId: setting.workspaceId,
        userId,
        action,
        resource: 'chaos_setting',
        resourceId: setting.id,
        metadata: {
          endpointId: setting.endpointId,
          destinationId: setting.destinationId,
          scope: setting.scope,
          seed: setting.seed,
          expiresAt: setting.expiresAt?.toISOString() ?? null,
          faults: pickFaults(setting),
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit log failed for ${action}: ${(err as Error).message}`,
      );
    }
  }
}
