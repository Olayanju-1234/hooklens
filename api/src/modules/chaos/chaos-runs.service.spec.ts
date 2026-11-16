import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ChaosRunsService } from './chaos-runs.service.js';
import { TestPayloadsService } from '../test-payloads/test-payloads.service.js';
import type { ChaosRun } from '../../entities/chaos-run.entity.js';
import type { ForwardResult } from '../../entities/forward-result.entity.js';

const ENDPOINT = {
  id: 'ep-1',
  userId: 'owner-1',
  workspaceId: 'ws-1',
  name: 'Paystack',
  ingressSlug: 'src_0123456789abcdef01234567',
  forwardUrl: 'https://example.com/hooks',
};

describe('ChaosRunsService', () => {
  const runRepo = {
    create: jest.fn((v: Partial<ChaosRun>) => ({ ...v })),
    save: jest.fn((v: Partial<ChaosRun>) =>
      Promise.resolve({ ...v, id: 'run-1', createdAt: new Date() }),
    ),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const eventRepo = { find: jest.fn() };
  const resultRepo = { find: jest.fn() };
  const chaosService = {
    resolveTarget: jest.fn(),
    reserveRun: jest.fn(),
    reserveExtras: jest.fn(),
  };
  const endpointsService = { findOne: jest.fn() };
  let captured = 0;
  const ingress = {
    capture: jest.fn(() => Promise.resolve({ id: `evt-${++captured}` })),
    processEvent: jest.fn(),
  };
  let service: ChaosRunsService;

  beforeEach(() => {
    jest.clearAllMocks();
    captured = 0;
    chaosService.resolveTarget.mockResolvedValue({
      endpoint: ENDPOINT,
      destinationId: null,
    });
    chaosService.reserveRun.mockResolvedValue(true);
    chaosService.reserveExtras.mockImplementation((_ws: string, n: number) =>
      Promise.resolve(n),
    );
    endpointsService.findOne.mockResolvedValue(ENDPOINT);
    eventRepo.find.mockResolvedValue([]);
    resultRepo.find.mockResolvedValue([]);
    ingress.processEvent.mockResolvedValue(undefined);
    service = new ChaosRunsService(
      runRepo as never,
      eventRepo as never,
      resultRepo as never,
      chaosService as never,
      endpointsService as never,
      ingress as never,
      new TestPayloadsService(),
    );
  });

  describe('run', () => {
    it('sends each step as a linked test event with its scripted plan, in order', async () => {
      runRepo.findOne.mockResolvedValue({
        id: 'run-1',
        endpointId: 'ep-1',
        destinationId: null,
        destination: null,
        scenarioId: 'paystack-transfer-reversed-first',
        createdAt: new Date(),
      });
      await service.run(
        'paystack-transfer-reversed-first',
        'ep-1',
        'fallback',
        'member-1',
      );

      expect(chaosService.resolveTarget).toHaveBeenCalledWith(
        'ep-1',
        'fallback',
        'member-1',
      );
      expect(runRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          endpointId: 'ep-1',
          destinationId: null,
          scenarioId: 'paystack-transfer-reversed-first',
          createdBy: 'member-1',
        }),
      );
      const captures = (ingress.capture.mock.calls as unknown[][]).map(
        ([p]) => p as Record<string, unknown> & { body: { event: string } },
      );
      expect(captures.map((c) => [c.body.event, c.chaosStep])).toEqual([
        ['transfer.success', 0],
        ['transfer.reversed', 1],
      ]);
      expect(
        captures.every(
          (c) =>
            c.isTest === true &&
            c.chaosRunId === 'run-1' &&
            c.userId === 'owner-1',
        ),
      ).toBe(true);

      const processed = (ingress.processEvent.mock.calls as unknown[][]).map(
        ([, , opts]) =>
          opts as {
            trusted: boolean;
            scenario: { runId: string; destinationId: null; plan: unknown };
          },
      );
      expect(processed.every((o) => o.trusted)).toBe(true);
      expect(processed[0].scenario).toEqual({
        runId: 'run-1',
        destinationId: null,
        plan: { primary: { kind: 'reorder', delayMs: 20_000 }, extras: [] },
      });
    });

    it('reserves the extra copies up front, all or nothing', async () => {
      runRepo.findOne.mockResolvedValue({
        id: 'run-1',
        endpointId: 'ep-1',
        destinationId: null,
        scenarioId: 'paystack-charge-success-3x',
        createdAt: new Date(),
      });
      await service.run('paystack-charge-success-3x', 'ep-1', 'fallback', 'u');
      expect(chaosService.reserveExtras).toHaveBeenCalledWith('ws-1', 2, {
        allOrNothing: true,
      });
    });

    it('404s an unknown scenario before touching anything', async () => {
      await expect(
        service.run('nope', 'ep-1', 'fallback', 'u'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(chaosService.resolveTarget).not.toHaveBeenCalled();
    });

    it("404s a route the user can't see, and sends nothing", async () => {
      chaosService.resolveTarget.mockRejectedValue(
        new NotFoundException('Endpoint not found'),
      );
      await expect(
        service.run('paystack-charge-success-3x', 'ep-1', 'fallback', 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(runRepo.save).not.toHaveBeenCalled();
      expect(ingress.capture).not.toHaveBeenCalled();
    });

    it('rejects a bad target from resolveTarget', async () => {
      chaosService.resolveTarget.mockRejectedValue(
        new BadRequestException('This source has no forward URL'),
      );
      await expect(
        service.run('paystack-charge-success-3x', 'ep-1', 'fallback', 'u'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 429 once the workspace used its runs, and sends nothing', async () => {
      chaosService.reserveRun.mockResolvedValue(false);
      const err = await service
        .run('paystack-charge-success-3x', 'ep-1', 'fallback', 'u')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect(runRepo.save).not.toHaveBeenCalled();
      expect(ingress.capture).not.toHaveBeenCalled();
    });

    it('answers 429 when the extra copies do not fit the minute budget', async () => {
      chaosService.reserveExtras.mockResolvedValue(0);
      const err = await service
        .run('paystack-charge-success-3x', 'ep-1', 'fallback', 'u')
        .catch((e: unknown) => e);
      expect((err as HttpException).getStatus()).toBe(429);
      expect(ingress.capture).not.toHaveBeenCalled();
    });

    it('runs a scenario without extra copies even when the budget is spent', async () => {
      chaosService.reserveExtras.mockResolvedValue(0);
      runRepo.findOne.mockResolvedValue({
        id: 'run-1',
        endpointId: 'ep-1',
        destinationId: null,
        scenarioId: 'paystack-refund-before-charge',
        createdAt: new Date(),
      });
      await service.run(
        'paystack-refund-before-charge',
        'ep-1',
        'fallback',
        'u',
      );
      expect(ingress.capture).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRun', () => {
    const createdAt = new Date(Date.now() - 10_000);
    const run = {
      id: 'run-1',
      endpointId: 'ep-1',
      destinationId: 'dest-1',
      destination: { label: 'Staging', url: 'https://staging.example.com' },
      scenarioId: 'paystack-charge-success-3x',
      createdAt,
    };
    const result = (over: Partial<ForwardResult>): Partial<ForwardResult> => ({
      eventId: 'evt-1',
      chaosKind: null,
      chaosSeq: 0,
      attempt: 1,
      status: 'forwarded',
      responseCode: 200,
      latency: 30,
      startedAt: new Date(createdAt.getTime() + 500),
      responseBody: 'x'.repeat(400),
      ...over,
    });

    beforeEach(() => {
      runRepo.findOne.mockResolvedValue(run);
      eventRepo.find.mockResolvedValue([
        { id: 'evt-1', chaosStep: 0, eventType: 'charge.success' },
      ]);
    });

    it('returns every delivery with its kind, code, offset and a body excerpt', async () => {
      resultRepo.find.mockResolvedValue([
        result({}),
        result({
          chaosKind: 'duplicate',
          chaosSeq: 1,
          status: 'failed',
          responseCode: 500,
          startedAt: new Date(createdAt.getTime() + 2500),
        }),
      ]);
      const view = await service.getRun('run-1', 'u');

      expect(view).toMatchObject({
        title: 'charge.success delivered 3 times',
        target: 'dest-1',
        targetLabel: 'Staging',
        expectedDeliveries: 3,
        recordedDeliveries: 2,
        complete: false,
      });
      expect(
        view.deliveries.map((d) => [
          d.chaosKind,
          d.chaosSeq,
          d.responseCode,
          d.offsetMs,
        ]),
      ).toEqual([
        [null, 0, 200, 500],
        ['duplicate', 1, 500, 2500],
      ]);
      expect(view.deliveries[0].bodyExcerpt).toHaveLength(300);
      expect(view.steps[0]).toMatchObject({
        eventId: 'evt-1',
        eventType: 'charge.success',
      });
      expect(view.checklist.length).toBeGreaterThan(0);
    });

    it('counts retries of one delivery once and completes when every delivery landed', async () => {
      resultRepo.find.mockResolvedValue([
        result({ status: 'failed', responseCode: 503 }),
        result({ attempt: 2 }),
        result({ chaosKind: 'duplicate', chaosSeq: 1 }),
        result({ chaosKind: 'duplicate', chaosSeq: 2 }),
      ]);
      const view = await service.getRun('run-1', 'u');
      expect(view.recordedDeliveries).toBe(3);
      expect(view.complete).toBe(true);
    });

    it('completes after the grace period even if a delivery never came', async () => {
      runRepo.findOne.mockResolvedValue({
        ...run,
        createdAt: new Date(Date.now() - 10 * 60_000),
      });
      const view = await service.getRun('run-1', 'u');
      expect(view.recordedDeliveries).toBe(0);
      expect(view.complete).toBe(true);
    });

    it("404s a run on a route the user can't see", async () => {
      endpointsService.findOne.mockRejectedValue(
        new NotFoundException('Endpoint not found'),
      );
      await expect(service.getRun('run-1', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(eventRepo.find).not.toHaveBeenCalled();
    });

    it('404s an unknown run', async () => {
      runRepo.findOne.mockResolvedValue(null);
      await expect(service.getRun('nope', 'u')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listRuns', () => {
    it('lists recent runs for a route the user can see', async () => {
      runRepo.find.mockResolvedValue([
        {
          id: 'run-1',
          scenarioId: 'paystack-stale-replay',
          destinationId: null,
          createdAt: new Date('2026-11-16T20:00:00Z'),
        },
      ]);
      expect(await service.listRuns('ep-1', 'u')).toEqual([
        {
          id: 'run-1',
          scenarioId: 'paystack-stale-replay',
          title: 'Stale replay of charge.success',
          target: 'fallback',
          createdAt: '2026-11-16T20:00:00.000Z',
        },
      ]);
      expect(endpointsService.findOne).toHaveBeenCalledWith('ep-1', 'u');
    });
  });

  it('lists the scenarios with their delivery counts', () => {
    const scenarios = service.listScenarios();
    expect(scenarios).toHaveLength(5);
    expect(scenarios[0]).toMatchObject({
      id: 'paystack-charge-success-3x',
      expectedDeliveries: 3,
    });
  });
});
