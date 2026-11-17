import type { Job } from 'bullmq';
import {
  ForwardProcessor,
  type DeliverJobData,
  type ForwardJobData,
} from './forward.processor.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import type { ChaosSetting } from '../../entities/chaos-setting.entity.js';
import { signStandardWebhook } from '../../common/utils/standard-webhooks.js';
import type { ChaosDelivery } from '../chaos/chaos-plan.js';

const SECRET = `whsec_${Buffer.from('chaos-test-secret-32-bytes-long!').toString('base64')}`;
const PUBLIC_URL = 'https://203.0.113.10/hook';

interface QueuedJob {
  name: string;
  data: DeliverJobData;
  opts: {
    jobId?: string;
    attempts?: number;
    delay?: number;
  };
}

function setting(over: Partial<ChaosSetting> = {}): ChaosSetting {
  return {
    id: 'chaos-1',
    workspaceId: 'ws-1',
    endpointId: 'ep-1',
    destinationId: 'dest-1',
    enabled: true,
    expiresAt: new Date(Date.now() + 60_000),
    scope: 'test',
    seed: 'seed-1',
    duplicateProbability: 0,
    duplicateCopies: 1,
    duplicateGapMs: 3000,
    delayProbability: 0,
    delayMinMs: 30_000,
    delayMaxMs: 120_000,
    reorderProbability: 0,
    reorderWindowMs: 10_000,
    staleProbability: 0,
    ...over,
  } as ChaosSetting;
}

describe('ForwardProcessor', () => {
  let event: Record<string, unknown>;
  let endpoint: Record<string, unknown>;
  let txResults: Partial<ForwardResult>[];
  let txDeadLetters: Partial<DeadLetterEvent>[];

  const tx = {
    createQueryBuilder: jest.fn(),
    find: jest.fn((entity: unknown) =>
      Promise.resolve(entity === ForwardResult ? txResults : txDeadLetters),
    ),
    update: jest.fn(),
  };
  const eventRepo = {
    findOne: jest.fn(() => Promise.resolve(event)),
    update: jest.fn(),
    manager: {
      transaction: jest.fn((cb: (m: typeof tx) => unknown) => cb(tx)),
    },
  };
  const endpointRepo = {
    findOne: jest.fn(() => Promise.resolve(endpoint)),
    createQueryBuilder: jest.fn(() => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(endpoint)),
    })),
  };
  const destinationRepo = { find: jest.fn(), findOne: jest.fn() };
  const resultRepo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
    exists: jest.fn(),
  };
  const deadLetterRepo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  };
  const transformRuleRepo = { find: jest.fn(() => Promise.resolve([])) };
  const forwardQueue = { addBulk: jest.fn() };
  const axiosRef = jest.fn();
  const wsGateway = {
    broadcastForwardResult: jest.fn(),
    broadcastChaosDelivery: jest.fn(),
  };
  const alertingService = { evaluateForwardFailure: jest.fn() };
  const chaosService = {
    activeForEndpoint: jest.fn(),
    reserveExtras: jest.fn((_ws: string, wanted: number) =>
      Promise.resolve(wanted),
    ),
    isActive: jest.fn(),
  };
  const configService = { get: jest.fn(() => false) };

  let processor: ForwardProcessor;

  const queued = (call = 0) =>
    (forwardQueue.addBulk.mock.calls as unknown[][])[call][0] as QueuedJob[];
  const fanOut = (data: Partial<ForwardJobData> = {}) =>
    processor.process({
      name: 'forward',
      data: { eventId: 'evt-1', endpointId: 'ep-1', userId: 'user-1', ...data },
      attemptsMade: 0,
      opts: {},
    } as Job<ForwardJobData>);
  const deliver = (
    chaos?: ChaosDelivery,
    opts: { attempts?: number; attemptsMade?: number } = {},
    destinationId: string | null = null,
  ) =>
    processor.process({
      name: 'deliver',
      data: {
        eventId: 'evt-1',
        endpointId: 'ep-1',
        userId: 'user-1',
        destinationId,
        ...(chaos && { chaos }),
      },
      attemptsMade: opts.attemptsMade ?? 0,
      opts: { attempts: opts.attempts ?? 1 },
    } as Job<DeliverJobData>);

  beforeEach(() => {
    jest.clearAllMocks();
    event = {
      id: 'evt-1',
      workspaceId: 'ws-1',
      isTest: true,
      isReplay: false,
      headers: { 'content-type': 'application/json' },
      body: { event: 'charge.success' },
      rawBody: '{"event":"charge.success"}',
      targetCount: 1,
      forwardStatus: 'pending',
    };
    endpoint = {
      id: 'ep-1',
      forwardUrl: PUBLIC_URL,
      signingSecret: SECRET,
      retryMaxAttempts: 2,
      retryBackoffMs: 1000,
    };
    txResults = [];
    txDeadLetters = [];
    tx.createQueryBuilder.mockReturnValue({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(event)),
    });
    destinationRepo.find.mockResolvedValue([
      { id: 'dest-1', url: PUBLIC_URL, label: 'Staging' },
    ]);
    destinationRepo.findOne.mockResolvedValue({
      id: 'dest-1',
      url: PUBLIC_URL,
      label: 'Staging',
    });
    chaosService.activeForEndpoint.mockResolvedValue([]);
    chaosService.isActive.mockResolvedValue(true);
    alertingService.evaluateForwardFailure.mockResolvedValue(undefined);
    axiosRef.mockResolvedValue({ status: 200, data: { received: true } });
    processor = new ForwardProcessor(
      eventRepo as never,
      endpointRepo as never,
      destinationRepo as never,
      resultRepo as never,
      deadLetterRepo as never,
      transformRuleRepo as never,
      forwardQueue as never,
      { axiosRef } as never,
      wsGateway as never,
      alertingService as never,
      chaosService as never,
      configService as never,
    );
  });

  describe('fan-out', () => {
    it('queues one ordinary delivery per target when chaos is off', async () => {
      await fanOut();
      expect(queued()).toEqual([
        {
          name: 'deliver',
          data: {
            eventId: 'evt-1',
            endpointId: 'ep-1',
            userId: 'user-1',
            destinationId: 'dest-1',
          },
          opts: expect.objectContaining({
            jobId: 'deliver-evt-1-dest-1',
            attempts: 3,
          }) as unknown,
        },
      ]);
      expect(queued()[0].opts.delay).toBeUndefined();
      expect(chaosService.reserveExtras).not.toHaveBeenCalled();
    });

    it('queues duplicate copies of the same event, each with its own job id and one attempt', async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ duplicateProbability: 1, duplicateCopies: 2 }),
      ]);
      await fanOut();

      const jobs = queued();
      expect(jobs.map((j) => j.opts.jobId)).toEqual([
        'deliver-evt-1-dest-1',
        'deliver-evt-1-dest-1-c1',
        'deliver-evt-1-dest-1-c2',
      ]);
      expect(jobs.every((j) => j.data.eventId === 'evt-1')).toBe(true);
      expect(jobs[0].opts.attempts).toBe(3);
      expect(jobs[0].data.chaos).toBeUndefined();
      expect(jobs.slice(1).map((j) => [j.opts.attempts, j.opts.delay])).toEqual(
        [
          [1, 3000],
          [1, 6000],
        ],
      );
      expect(jobs.slice(1).map((j) => j.data.chaos)).toEqual([
        { kind: 'duplicate', seq: 1, delayMs: 3000 },
        { kind: 'duplicate', seq: 2, delayMs: 6000 },
      ]);
    });

    it('holds the real delivery back for a delay, keeping its retry policy', async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({
          delayProbability: 1,
          delayMinMs: 60_000,
          delayMaxMs: 90_000,
        }),
      ]);
      await fanOut();

      const [primary] = queued();
      expect(primary.opts.jobId).toBe('deliver-evt-1-dest-1');
      expect(primary.opts.attempts).toBe(3);
      expect(primary.opts.delay).toBeGreaterThanOrEqual(60_000);
      expect(primary.opts.delay).toBeLessThanOrEqual(90_000);
      expect(primary.data.chaos).toEqual({
        kind: 'delay',
        seq: 0,
        delayMs: primary.opts.delay,
      });
    });

    it('leaves real provider events alone when scope is test payloads only', async () => {
      event.isTest = false;
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ duplicateProbability: 1 }),
      ]);
      await fanOut();
      expect(queued()).toHaveLength(1);
      expect(queued()[0].data.chaos).toBeUndefined();
    });

    it('touches real provider events when scope is all', async () => {
      event.isTest = false;
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ scope: 'all', duplicateProbability: 1 }),
      ]);
      await fanOut();
      expect(queued()).toHaveLength(2);
    });

    it('never adds chaos to a replay', async () => {
      event.isReplay = true;
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ duplicateProbability: 1 }),
      ]);
      await fanOut();
      expect(queued()).toHaveLength(1);
      expect(chaosService.activeForEndpoint).not.toHaveBeenCalled();
    });

    it('never adds chaos to a targeted re-delivery', async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ duplicateProbability: 1 }),
      ]);
      await fanOut({ destinationId: 'dest-1' });
      expect(queued()).toHaveLength(1);
      expect(queued()[0].opts.jobId).toBeUndefined();
    });

    it('applies chaos to the fallback forward URL target', async () => {
      destinationRepo.find.mockResolvedValue([]);
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ destinationId: null, duplicateProbability: 1 }),
      ]);
      await fanOut();
      expect(queued().map((j) => [j.opts.jobId, j.data.destinationId])).toEqual(
        [
          ['deliver-evt-1-fallback', null],
          ['deliver-evt-1-fallback-c1', null],
        ],
      );
    });

    it("ignores another target's settings", async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ destinationId: 'dest-2', duplicateProbability: 1 }),
      ]);
      await fanOut();
      expect(queued()).toHaveLength(1);
    });

    it('drops extra copies beyond the workspace budget but keeps the real delivery', async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({ duplicateProbability: 1, duplicateCopies: 3 }),
      ]);
      chaosService.reserveExtras.mockResolvedValueOnce(1);
      await fanOut();
      expect(chaosService.reserveExtras).toHaveBeenCalledWith('ws-1', 3);
      expect(queued().map((j) => j.opts.jobId)).toEqual([
        'deliver-evt-1-dest-1',
        'deliver-evt-1-dest-1-c1',
      ]);
    });

    it('caps extra copies per event across targets', async () => {
      const ids = ['dest-1', 'dest-2', 'dest-3'];
      destinationRepo.find.mockResolvedValue(
        ids.map((id) => ({ id, url: PUBLIC_URL })),
      );
      chaosService.activeForEndpoint.mockResolvedValue(
        ids.map((id) =>
          setting({
            destinationId: id,
            duplicateProbability: 1,
            duplicateCopies: 3,
            staleProbability: 1,
          }),
        ),
      );
      await fanOut();
      expect(chaosService.reserveExtras).toHaveBeenCalledWith('ws-1', 8);
      const extras = queued().filter((j) => (j.data.chaos?.seq ?? 0) > 0);
      expect(extras).toHaveLength(8);
      expect(queued().filter((j) => !j.data.chaos)).toHaveLength(3);
    });

    it('rebuilds the identical jobs when the fan-out is retried', async () => {
      chaosService.activeForEndpoint.mockResolvedValue([
        setting({
          duplicateProbability: 0.5,
          duplicateCopies: 2,
          delayProbability: 0.5,
          staleProbability: 0.5,
        }),
      ]);
      await fanOut();
      await fanOut();
      expect(queued(1)).toEqual(queued(0));
    });

    it('delivers normally when chaos planning fails', async () => {
      chaosService.activeForEndpoint.mockRejectedValue(new Error('db down'));
      await fanOut();
      expect(queued()).toHaveLength(1);
      expect(queued()[0].data.chaos).toBeUndefined();
    });
  });

  describe('delivering a chaos copy', () => {
    const duplicate: ChaosDelivery = {
      kind: 'duplicate',
      seq: 1,
      delayMs: 3000,
    };

    it('sends the same body with the same webhook-id, freshly signed, and no chaos header', async () => {
      await deliver(duplicate);

      const request = (axiosRef.mock.calls as unknown[][])[0][0] as {
        headers: Record<string, string>;
        data: string;
      };
      expect(request.data).toBe('{"event":"charge.success"}');
      expect(request.headers['webhook-id']).toBe('evt-1');
      expect(request.headers['x-hookdash-event-id']).toBe('evt-1');
      const ts = Number(request.headers['webhook-timestamp']);
      expect(Math.abs(Date.now() / 1000 - ts)).toBeLessThan(5);
      expect(request.headers['webhook-signature']).toBe(
        signStandardWebhook(SECRET, 'evt-1', ts, request.data),
      );
      expect(Object.keys(request.headers).some((h) => /chaos/i.test(h))).toBe(
        false,
      );

      expect(resultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'forwarded',
          chaosKind: 'duplicate',
          chaosSeq: 1,
          chaosDelayMs: 3000,
        }),
      );
      expect(eventRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('records a failing copy without retrying, dead-lettering, settling or alerting', async () => {
      axiosRef.mockRejectedValue({
        response: { status: 500 },
        message: 'Request failed with status code 500',
      });
      await expect(deliver(duplicate)).resolves.toBeUndefined();

      expect(resultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          responseCode: 500,
          chaosSeq: 1,
        }),
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
      expect(eventRepo.manager.transaction).not.toHaveBeenCalled();
      expect(alertingService.evaluateForwardFailure).not.toHaveBeenCalled();
    });

    it('drops the copy when chaos was switched off after it was planned', async () => {
      chaosService.isActive.mockResolvedValue(false);
      await deliver(duplicate, {}, 'dest-1');
      expect(chaosService.isActive).toHaveBeenCalledWith('ep-1', 'dest-1');
      expect(axiosRef).not.toHaveBeenCalled();
      expect(resultRepo.save).not.toHaveBeenCalled();
    });

    it('signs a stale replay with a timestamp older than the 5-minute tolerance', async () => {
      resultRepo.exists.mockResolvedValue(true);
      await deliver({ kind: 'stale', seq: 1, delayMs: 30_000 });

      const request = (axiosRef.mock.calls as unknown[][])[0][0] as {
        headers: Record<string, string>;
        data: string;
      };
      const ts = Number(request.headers['webhook-timestamp']);
      expect(Date.now() / 1000 - ts).toBeGreaterThan(5 * 60);
      expect(request.headers['webhook-id']).toBe('evt-1');
      expect(request.headers['webhook-signature']).toBe(
        signStandardWebhook(SECRET, 'evt-1', ts, request.data),
      );
      expect(resultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ chaosKind: 'stale', chaosSeq: 1 }),
      );
    });

    it('skips a stale replay until the real delivery has succeeded', async () => {
      resultRepo.exists.mockResolvedValue(false);
      await deliver({ kind: 'stale', seq: 1, delayMs: 30_000 });
      expect(resultRepo.exists).toHaveBeenCalledWith({
        where: expect.objectContaining({
          eventId: 'evt-1',
          chaosSeq: 0,
          status: 'forwarded',
        }) as unknown,
      });
      expect(axiosRef).not.toHaveBeenCalled();
    });

    it('still blocks a copy aimed at a private address', async () => {
      endpoint.forwardUrl = 'http://10.0.0.5/hook';
      await deliver(duplicate);
      expect(axiosRef).not.toHaveBeenCalled();
      expect(resultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          chaosSeq: 1,
          responseBody: expect.stringContaining('private') as unknown,
        }),
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('never dead-letters a copy that crashed unexpectedly', async () => {
      await processor.onFailed(
        {
          name: 'deliver',
          data: {
            eventId: 'evt-1',
            endpointId: 'ep-1',
            userId: 'user-1',
            destinationId: null,
            chaos: duplicate,
          },
          attemptsMade: 1,
          opts: { attempts: 1 },
        } as Job<DeliverJobData>,
        new Error('connection reset'),
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('real deliveries and the event status', () => {
    it('dead-letters a held real delivery that fails its last attempt, and alerts', async () => {
      axiosRef.mockRejectedValue({
        response: { status: 500 },
        message: 'Request failed with status code 500',
      });
      txResults = [
        { destinationId: null, target: null, status: 'failed', chaosSeq: 0 },
      ];
      txDeadLetters = [{ destinationId: null }];

      await deliver({ kind: 'delay', seq: 0, delayMs: 60_000 });

      expect(resultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ chaosKind: 'delay', chaosSeq: 0 }),
      );
      expect(deadLetterRepo.save).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalledWith(
        expect.anything(),
        'evt-1',
        expect.objectContaining({ forwardStatus: 'failed' }),
      );
      expect(alertingService.evaluateForwardFailure).toHaveBeenCalledWith(
        'ws-1',
        'evt-1',
      );
    });

    it('settles from real deliveries only, so failing copies never fail the event', async () => {
      txResults = [
        {
          destinationId: null,
          target: null,
          status: 'forwarded',
          responseCode: 200,
          chaosSeq: 0,
        },
        {
          destinationId: null,
          target: null,
          status: 'failed',
          responseCode: 500,
          chaosSeq: 1,
        },
      ];
      await deliver();

      expect(tx.find).toHaveBeenCalledWith(ForwardResult, {
        where: expect.objectContaining({
          eventId: 'evt-1',
          chaosSeq: 0,
        }) as unknown,
        order: { createdAt: 'ASC' },
      });
      expect(tx.update).toHaveBeenCalledWith(
        expect.anything(),
        'evt-1',
        expect.objectContaining({
          forwardStatus: 'forwarded',
          forwardCode: 200,
        }),
      );
      expect(alertingService.evaluateForwardFailure).not.toHaveBeenCalled();
    });

    it('still retries an ordinary failed delivery before its last attempt', async () => {
      axiosRef.mockRejectedValue({ message: 'ECONNREFUSED' });
      await expect(deliver(undefined, { attempts: 3 })).rejects.toThrow(
        'Delivery failed',
      );
      expect(deadLetterRepo.save).not.toHaveBeenCalled();
    });

    it('dead-letters an ordinary delivery that crashed on its last attempt', async () => {
      await processor.onFailed(
        {
          name: 'deliver',
          data: {
            eventId: 'evt-1',
            endpointId: 'ep-1',
            userId: 'user-1',
            destinationId: null,
          },
          attemptsMade: 1,
          opts: { attempts: 1 },
        } as Job<DeliverJobData>,
        new Error('connection reset'),
      );
      expect(deadLetterRepo.save).toHaveBeenCalled();
    });
  });

  describe('scenario runs', () => {
    const plan = {
      primary: { kind: 'reorder' as const, delayMs: 20_000 },
      extras: [{ kind: 'duplicate' as const, seq: 1, delayMs: 22_000 }],
    };

    it('delivers only to the run target with its exact plan, ignoring chaos settings and the budget', async () => {
      destinationRepo.find.mockResolvedValue([
        { id: 'dest-1', url: PUBLIC_URL },
        { id: 'dest-2', url: PUBLIC_URL },
      ]);
      destinationRepo.findOne.mockResolvedValue({
        id: 'dest-2',
        url: PUBLIC_URL,
      });
      await fanOut({
        scenario: { runId: 'run-1', destinationId: 'dest-2', plan },
      });

      expect(chaosService.activeForEndpoint).not.toHaveBeenCalled();
      expect(chaosService.reserveExtras).not.toHaveBeenCalled();
      const jobs = queued();
      expect(
        jobs.map((j) => [j.opts.jobId, j.data.destinationId, j.opts.delay]),
      ).toEqual([
        ['deliver-evt-1-dest-2', 'dest-2', 20_000],
        ['deliver-evt-1-dest-2-c1', 'dest-2', 22_000],
      ]);
      expect(jobs[1].data.chaos).toEqual({
        kind: 'duplicate',
        seq: 1,
        delayMs: 22_000,
        runId: 'run-1',
      });
    });

    it('runs against the fallback forward URL', async () => {
      await fanOut({ scenario: { runId: 'run-1', destinationId: null, plan } });
      expect(queued().map((j) => j.data.destinationId)).toEqual([null, null]);
    });

    it('skips the run when its destination was removed', async () => {
      destinationRepo.findOne.mockResolvedValue(null);
      await fanOut({
        scenario: { runId: 'run-1', destinationId: 'dest-9', plan },
      });
      expect(forwardQueue.addBulk).not.toHaveBeenCalled();
      expect(eventRepo.update).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ forwardStatus: 'skipped' }),
      );
    });

    it("sends a run's copy even with the target's chaos settings off", async () => {
      chaosService.isActive.mockResolvedValue(false);
      await deliver({
        kind: 'duplicate',
        seq: 1,
        delayMs: 2000,
        runId: 'run-1',
      });
      expect(chaosService.isActive).not.toHaveBeenCalled();
      expect(axiosRef).toHaveBeenCalledTimes(1);
    });

    it('broadcasts every delivery of a run event, including the real one', async () => {
      event.chaosRunId = 'run-1';
      await deliver();
      expect(wsGateway.broadcastChaosDelivery).toHaveBeenCalledWith(
        'user-1',
        'ws-1',
        {
          runId: 'run-1',
          eventId: 'evt-1',
          chaosKind: null,
          chaosSeq: 0,
          status: 'forwarded',
          responseCode: 200,
        },
      );
    });

    it('broadcasts chaos copies outside runs, but not ordinary deliveries', async () => {
      await deliver();
      expect(wsGateway.broadcastChaosDelivery).not.toHaveBeenCalled();
      await deliver({ kind: 'duplicate', seq: 1, delayMs: 0 });
      expect(wsGateway.broadcastChaosDelivery).toHaveBeenCalledWith(
        'user-1',
        'ws-1',
        expect.objectContaining({
          runId: null,
          chaosKind: 'duplicate',
          chaosSeq: 1,
        }),
      );
    });
  });
});
