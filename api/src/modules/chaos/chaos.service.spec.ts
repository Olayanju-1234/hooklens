import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ChaosService,
  DEFAULT_CHAOS_MINUTES,
  MAX_RUNS_PER_WINDOW,
  isChaosActive,
} from './chaos.service.js';
import { UpdateChaosDto } from './dto/chaos.dto.js';
import { MAX_EXTRAS_PER_WORKSPACE_MINUTE } from './chaos-plan.js';
import type { ChaosSetting } from '../../entities/chaos-setting.entity.js';

const ENDPOINT = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  forwardUrl: 'https://example.com/hooks',
};
const DEST_ID = '33333333-3333-4333-8333-333333333333';
const USER = 'user-1';

function row(over: Partial<ChaosSetting> = {}): ChaosSetting {
  return {
    id: 'chaos-1',
    workspaceId: ENDPOINT.workspaceId,
    endpointId: ENDPOINT.id,
    destinationId: null,
    enabled: true,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    scope: 'test',
    seed: 'abc123',
    duplicateProbability: 1,
    duplicateCopies: 2,
    duplicateGapMs: 5000,
    delayProbability: 0,
    delayMinMs: 30_000,
    delayMaxMs: 120_000,
    reorderProbability: 0,
    reorderWindowMs: 10_000,
    staleProbability: 0,
    updatedBy: USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ChaosSetting;
}

describe('ChaosService', () => {
  const settingRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn((v: Partial<ChaosSetting>) => ({ ...v })),
    save: jest.fn((v: Partial<ChaosSetting>) =>
      Promise.resolve({ id: 'chaos-1', updatedAt: new Date(), ...v }),
    ),
    update: jest.fn(),
  };
  const destinationRepo = { find: jest.fn(), findOne: jest.fn() };
  const endpointsService = { findOne: jest.fn() };
  const workspacesService = { assertOwner: jest.fn() };
  const auditService = { log: jest.fn() };
  const multi = {
    incrby: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };
  const redis = { multi: jest.fn(() => multi), decrby: jest.fn() };
  const forwardQueue = { client: Promise.resolve(redis) };

  let service: ChaosService;

  beforeEach(() => {
    jest.clearAllMocks();
    endpointsService.findOne.mockResolvedValue({ ...ENDPOINT });
    settingRepo.findOne.mockResolvedValue(null);
    auditService.log.mockResolvedValue(undefined);
    workspacesService.assertOwner.mockResolvedValue(undefined);
    service = new ChaosService(
      settingRepo as never,
      destinationRepo as never,
      endpointsService as never,
      workspacesService as never,
      auditService as never,
      forwardQueue as never,
    );
  });

  describe('upsert', () => {
    it('turns chaos on for the fallback target with a 30-minute expiry, a generated seed and an audit entry', async () => {
      const before = Date.now();
      const view = await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        duplicateProbability: 1,
      });

      const saved = settingRepo.save.mock.calls[0][0] as ChaosSetting;
      expect(saved).toMatchObject({
        workspaceId: ENDPOINT.workspaceId,
        endpointId: ENDPOINT.id,
        destinationId: null,
        enabled: true,
        scope: 'test',
        duplicateProbability: 1,
        updatedBy: USER,
      });
      expect(saved.seed).toMatch(/^[a-f0-9]{16}$/);
      const expiry = saved.expiresAt!.getTime();
      expect(expiry).toBeGreaterThanOrEqual(
        before + DEFAULT_CHAOS_MINUTES * 60_000,
      );
      expect(expiry).toBeLessThanOrEqual(
        Date.now() + DEFAULT_CHAOS_MINUTES * 60_000,
      );
      expect(view).toMatchObject({ target: 'fallback', active: true });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'chaos.enable',
          workspaceId: ENDPOINT.workspaceId,
          userId: USER,
          resource: 'chaos_setting',
        }),
      );
    });

    it('accepts the 24-hour maximum duration', async () => {
      await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        durationMinutes: 1440,
        staleProbability: 1,
      });
      const saved = settingRepo.save.mock.calls[0][0] as ChaosSetting;
      expect(saved.expiresAt!.getTime() - Date.now()).toBeGreaterThan(
        1439 * 60_000,
      );
    });

    it('keeps the stored seed unless a new one is given', async () => {
      settingRepo.findOne.mockResolvedValue(row({ seed: 'stored' }));
      await service.upsert(ENDPOINT.id, 'fallback', USER, { enabled: true });
      expect((settingRepo.save.mock.calls[0][0] as ChaosSetting).seed).toBe(
        'stored',
      );

      settingRepo.findOne.mockResolvedValue(row({ seed: 'stored' }));
      await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        seed: 'run-42',
      });
      expect((settingRepo.save.mock.calls[1][0] as ChaosSetting).seed).toBe(
        'run-42',
      );
    });

    it('records an update of active chaos, and a disable when PUT turns it off', async () => {
      settingRepo.findOne.mockResolvedValue(row());
      await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        duplicateCopies: 3,
      });
      expect(auditService.log).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'chaos.update' }),
      );

      settingRepo.findOne.mockResolvedValue(row());
      const view = await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: false,
      });
      expect(view.active).toBe(false);
      expect(view.expiresAt).toBeNull();
      expect(auditService.log).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'chaos.disable' }),
      );
    });

    it('refuses to turn on chaos with every fault at 0', async () => {
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', USER, { enabled: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(settingRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a minimum delay above the maximum', async () => {
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', USER, {
          enabled: true,
          delayProbability: 1,
          delayMinMs: 60_000,
          delayMaxMs: 30_000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets only the workspace owner turn on chaos for all events', async () => {
      workspacesService.assertOwner.mockRejectedValue(
        new ForbiddenException('Owner access required'),
      );
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', USER, {
          enabled: true,
          scope: 'all',
          duplicateProbability: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(workspacesService.assertOwner).toHaveBeenCalledWith(
        ENDPOINT.workspaceId,
        USER,
      );
      expect(settingRepo.save).not.toHaveBeenCalled();
    });

    it('applies the owner check to a stored `all` scope too', async () => {
      settingRepo.findOne.mockResolvedValue(
        row({ enabled: false, expiresAt: null, scope: 'all' }),
      );
      workspacesService.assertOwner.mockRejectedValue(
        new ForbiddenException('Owner access required'),
      );
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', USER, { enabled: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the owner turn on chaos for all events', async () => {
      const view = await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        scope: 'all',
        delayProbability: 1,
      });
      expect(workspacesService.assertOwner).toHaveBeenCalled();
      expect(view.scope).toBe('all');
    });

    it('does not ask for the owner when scope is test', async () => {
      await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        reorderProbability: 1,
      });
      expect(workspacesService.assertOwner).not.toHaveBeenCalled();
    });

    it('sets chaos on a destination that belongs to the endpoint', async () => {
      destinationRepo.findOne.mockResolvedValue({
        id: DEST_ID,
        endpointId: ENDPOINT.id,
      });
      const view = await service.upsert(ENDPOINT.id, DEST_ID, USER, {
        enabled: true,
        duplicateProbability: 1,
      });
      expect(destinationRepo.findOne).toHaveBeenCalledWith({
        where: { id: DEST_ID, endpointId: ENDPOINT.id },
      });
      expect(view.destinationId).toBe(DEST_ID);
    });

    it('404s a destination from another endpoint', async () => {
      destinationRepo.findOne.mockResolvedValue(null);
      await expect(
        service.upsert(ENDPOINT.id, DEST_ID, USER, {
          enabled: true,
          duplicateProbability: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(settingRepo.save).not.toHaveBeenCalled();
    });

    it("404s an endpoint the user can't see, before touching settings", async () => {
      endpointsService.findOne.mockRejectedValue(
        new NotFoundException('Endpoint not found'),
      );
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', 'stranger', {
          enabled: true,
          duplicateProbability: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(settingRepo.findOne).not.toHaveBeenCalled();
      expect(settingRepo.save).not.toHaveBeenCalled();
    });

    it("404s a route outside the request's workspace, as an API key from another workspace would see it", async () => {
      await expect(
        service.upsert(
          ENDPOINT.id,
          'fallback',
          USER,
          { enabled: true, duplicateProbability: 1 },
          'other-workspace',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(settingRepo.save).not.toHaveBeenCalled();
      await expect(
        service.list(ENDPOINT.id, USER, 'other-workspace'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.disable(ENDPOINT.id, 'fallback', USER, 'other-workspace'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('accepts a route in the request workspace', async () => {
      const view = await service.upsert(
        ENDPOINT.id,
        'fallback',
        USER,
        { enabled: true, duplicateProbability: 1 },
        ENDPOINT.workspaceId,
      );
      expect(view.active).toBe(true);
    });

    it('rejects the fallback target when the source has no forward URL', async () => {
      endpointsService.findOne.mockResolvedValue({
        ...ENDPOINT,
        forwardUrl: null,
      });
      await expect(
        service.upsert(ENDPOINT.id, 'fallback', USER, {
          enabled: true,
          duplicateProbability: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a target that is neither a uuid nor fallback', async () => {
      await expect(
        service.upsert(ENDPOINT.id, 'not-a-target', USER, {
          enabled: true,
          duplicateProbability: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still saves when the audit log fails', async () => {
      auditService.log.mockRejectedValue(new Error('db down'));
      const view = await service.upsert(ENDPOINT.id, 'fallback', USER, {
        enabled: true,
        duplicateProbability: 1,
      });
      expect(view.active).toBe(true);
    });
  });

  describe('disable', () => {
    it('switches active chaos off and audits it', async () => {
      settingRepo.findOne.mockResolvedValue(row());
      await service.disable(ENDPOINT.id, 'fallback', USER);
      expect(settingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, expiresAt: null }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chaos.disable' }),
      );
    });

    it('does nothing when chaos is already off', async () => {
      settingRepo.findOne.mockResolvedValue(
        row({ enabled: false, expiresAt: null }),
      );
      await service.disable(ENDPOINT.id, 'fallback', USER);
      expect(settingRepo.save).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('expiry', () => {
    it('treats chaos past its expiry as inactive', () => {
      expect(isChaosActive(row())).toBe(true);
      expect(isChaosActive(row({ expiresAt: new Date(Date.now() - 1) }))).toBe(
        false,
      );
      expect(isChaosActive(row({ enabled: false }))).toBe(false);
    });

    it('lists expired chaos as not active', async () => {
      destinationRepo.find.mockResolvedValue([]);
      settingRepo.find.mockResolvedValue([
        row({ expiresAt: new Date(Date.now() - 60_000) }),
      ]);
      const [fallback] = await service.list(ENDPOINT.id, USER);
      expect(fallback.chaos).toMatchObject({ enabled: true, active: false });
    });

    it('switches off due settings and audits each one with no user', async () => {
      settingRepo.find.mockResolvedValue([
        row({ id: 'a', expiresAt: new Date(Date.now() - 1000) }),
        row({ id: 'b', expiresAt: new Date(Date.now() - 2000) }),
      ]);
      expect(await service.expireDue()).toBe(2);
      expect(settingRepo.update).toHaveBeenCalledTimes(2);
      expect(
        (settingRepo.update.mock.calls as unknown[][])[0][0],
      ).toMatchObject({
        id: 'a',
        enabled: true,
      });
      expect((settingRepo.update.mock.calls as unknown[][])[0][1]).toEqual({
        enabled: false,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'chaos.expire', userId: null }),
      );
    });

    it('does nothing when nothing is due', async () => {
      settingRepo.find.mockResolvedValue([]);
      expect(await service.expireDue()).toBe(0);
      expect(settingRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns each destination and the fallback with its chaos settings', async () => {
      destinationRepo.find.mockResolvedValue([
        { id: DEST_ID, label: 'Staging', url: 'https://staging.example.com' },
      ]);
      settingRepo.find.mockResolvedValue([row({ destinationId: DEST_ID })]);
      const targets = await service.list(ENDPOINT.id, USER);
      expect(targets.map((t) => [t.target, t.label, Boolean(t.chaos)])).toEqual(
        [
          [DEST_ID, 'Staging', true],
          ['fallback', 'forward URL', false],
        ],
      );
    });
  });

  describe('reserveExtras', () => {
    it('grants everything within the per-minute budget', async () => {
      multi.exec.mockResolvedValue([
        [null, 3],
        [null, 1],
      ]);
      expect(await service.reserveExtras(ENDPOINT.workspaceId, 3)).toBe(3);
      expect(multi.incrby).toHaveBeenCalledWith(
        expect.stringContaining(`chaos:extras:${ENDPOINT.workspaceId}:`),
        3,
      );
      expect(redis.decrby).not.toHaveBeenCalled();
    });

    it('grants only what is left and gives the rest back', async () => {
      multi.exec.mockResolvedValue([
        [null, MAX_EXTRAS_PER_WORKSPACE_MINUTE + 2],
        [null, 1],
      ]);
      expect(await service.reserveExtras(ENDPOINT.workspaceId, 4)).toBe(2);
      expect(redis.decrby).toHaveBeenCalledWith(expect.any(String), 2);
    });

    it('grants nothing once the budget is spent', async () => {
      multi.exec.mockResolvedValue([
        [null, MAX_EXTRAS_PER_WORKSPACE_MINUTE + 4],
        [null, 1],
      ]);
      expect(await service.reserveExtras(ENDPOINT.workspaceId, 4)).toBe(0);
    });

    it('grants nothing when Redis fails', async () => {
      multi.exec.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await service.reserveExtras(ENDPOINT.workspaceId, 2)).toBe(0);
    });

    it('skips Redis when nothing is wanted', async () => {
      expect(await service.reserveExtras(ENDPOINT.workspaceId, 0)).toBe(0);
      expect(redis.multi).not.toHaveBeenCalled();
    });
  });

  describe('reserveExtras all or nothing', () => {
    it('grants nothing and gives everything back when only part fits', async () => {
      multi.exec.mockResolvedValue([
        [null, MAX_EXTRAS_PER_WORKSPACE_MINUTE + 1],
        [null, 1],
      ]);
      expect(
        await service.reserveExtras(ENDPOINT.workspaceId, 2, {
          allOrNothing: true,
        }),
      ).toBe(0);
      expect(redis.decrby).toHaveBeenCalledWith(expect.any(String), 2);
    });
  });

  describe('reserveRun', () => {
    it('allows a run within the 10-minute allowance', async () => {
      multi.exec.mockResolvedValue([
        [null, MAX_RUNS_PER_WINDOW],
        [null, 1],
      ]);
      expect(await service.reserveRun(ENDPOINT.workspaceId)).toBe(true);
      expect(multi.incrby).toHaveBeenCalledWith(
        expect.stringContaining(`chaos:runs:${ENDPOINT.workspaceId}:`),
        1,
      );
    });

    it('refuses the run past the allowance', async () => {
      multi.exec.mockResolvedValue([
        [null, MAX_RUNS_PER_WINDOW + 1],
        [null, 1],
      ]);
      expect(await service.reserveRun(ENDPOINT.workspaceId)).toBe(false);
      expect(redis.decrby).toHaveBeenCalledWith(expect.any(String), 1);
    });

    it('refuses the run when Redis fails', async () => {
      multi.exec.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await service.reserveRun(ENDPOINT.workspaceId)).toBe(false);
    });
  });

  describe('activeInWorkspace', () => {
    it('lists active chaos with route and target names', async () => {
      settingRepo.find.mockResolvedValue([
        row({
          destinationId: DEST_ID,
          endpoint: { name: 'Paystack' },
          destination: { label: null, url: 'https://staging.example.com' },
        } as Partial<ChaosSetting>),
        row({
          endpoint: { name: 'Paystack' },
          destination: null,
        } as Partial<ChaosSetting>),
      ]);
      const active = await service.activeInWorkspace(ENDPOINT.workspaceId);
      expect(settingRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: ENDPOINT.workspaceId,
            enabled: true,
          }) as unknown,
        }),
      );
      expect(
        active.map((a) => [a.endpointName, a.target, a.targetLabel]),
      ).toEqual([
        ['Paystack', DEST_ID, 'https://staging.example.com'],
        ['Paystack', 'fallback', 'forward URL'],
      ]);
      expect(active[0].faults).toMatchObject({ duplicateProbability: 1 });
    });
  });
});

describe('UpdateChaosDto', () => {
  const errors = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateChaosDto, body))).map(
      (e) => e.property,
    );

  it('accepts a full valid body', async () => {
    expect(
      await errors({
        enabled: true,
        durationMinutes: 1440,
        scope: 'all',
        seed: 'run_42-a',
        duplicateProbability: 0.5,
        duplicateCopies: 3,
        duplicateGapMs: 0,
        delayProbability: 1,
        delayMinMs: 0,
        delayMaxMs: 900_000,
        reorderProbability: 0.2,
        reorderWindowMs: 1000,
        staleProbability: 1,
      }),
    ).toEqual([]);
  });

  it('rejects a duration over 24 hours and out-of-range faults', async () => {
    expect(
      await errors({
        enabled: true,
        durationMinutes: 1441,
        scope: 'prod',
        seed: 'has space',
        duplicateProbability: 1.5,
        duplicateCopies: 4,
        delayMaxMs: 900_001,
        reorderWindowMs: 500,
      }),
    ).toEqual(
      expect.arrayContaining([
        'durationMinutes',
        'scope',
        'seed',
        'duplicateProbability',
        'duplicateCopies',
        'delayMaxMs',
        'reorderWindowMs',
      ]),
    );
  });

  it('requires enabled', async () => {
    expect(await errors({})).toContain('enabled');
  });
});
