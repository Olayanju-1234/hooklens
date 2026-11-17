import {
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { CombinedAuthGuard } from './guards/auth.guard.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { EndpointsController } from '../endpoints/endpoints.controller.js';
import { EndpointsService } from '../endpoints/endpoints.service.js';
import { EventsController } from '../events/events.controller.js';
import { EventsService } from '../events/events.service.js';
import { DeadLetterController } from '../dead-letter/dead-letter.controller.js';
import { DeadLetterService } from '../dead-letter/dead-letter.service.js';
import { TransformController } from '../transform/transform.controller.js';
import { TransformService } from '../transform/transform.service.js';
import { TestPayloadsController } from '../test-payloads/test-payloads.controller.js';
import { TestPayloadsService } from '../test-payloads/test-payloads.service.js';
import { IngressService } from '../ingress/ingress.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardDestination } from '../../entities/forward-destination.entity.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { User } from '../../entities/user.entity.js';
import { Workspace } from '../../entities/workspace.entity.js';

// One user in two workspaces, holding an API key for A; every resource below lives in B
const USER = '0b5f2c8e-1a2b-4c3d-8e9f-000000000001';
const WS_A = '0b5f2c8e-1a2b-4c3d-8e9f-0000000000aa';
const WS_B = '0b5f2c8e-1a2b-4c3d-8e9f-0000000000bb';
const KEY_A = 'hd_live_key_for_workspace_a';
const KEY_B = 'hd_live_key_for_workspace_b';
const JWT_SECRET = 'pinning-spec-secret';

const EP_B = {
  id: '0b5f2c8e-1a2b-4c3d-8e9f-0000000000e1',
  userId: USER,
  workspaceId: WS_B,
  name: 'B payments',
  provider: 'paystack',
  ingressSlug: 'src_b',
  isActive: true,
  forwardUrl: 'https://b.example.com/hook',
  retryMaxAttempts: 3,
  retryBackoffMs: 5000,
  responseStatusCode: 200,
  responseBody: null,
};
const DEST_B = {
  id: '0b5f2c8e-1a2b-4c3d-8e9f-0000000000d1',
  endpointId: EP_B.id,
  url: 'https://b.example.com/other',
  label: null,
  isActive: true,
};
const event = (id: string) => ({
  id,
  endpointId: EP_B.id,
  userId: USER,
  workspaceId: WS_B,
  method: 'POST',
  path: '/in/src_b',
  headers: { 'content-type': 'application/json' },
  body: { event: 'charge.success', id },
  rawBody: '{}',
  provider: 'paystack',
  eventType: 'charge.success',
  signatureValid: null,
  forwardStatus: 'failed',
  forwardCode: 500,
  forwardLatency: 12,
  receivedAt: new Date('2026-11-16T10:00:00Z'),
  createdAt: new Date('2026-11-16T10:00:00Z'),
  forwardedAt: new Date('2026-11-16T10:00:01Z'),
  processedAt: null,
  queuedAt: null,
  targetCount: 1,
});
const EVT_B = event('0b5f2c8e-1a2b-4c3d-8e9f-0000000000f1');
const EVT_B2 = event('0b5f2c8e-1a2b-4c3d-8e9f-0000000000f2');
const DL_B = {
  id: '0b5f2c8e-1a2b-4c3d-8e9f-0000000000c1',
  endpointId: EP_B.id,
  eventId: EVT_B.id,
  destinationId: null,
  lastAttempt: 3,
  lastError: 'HTTP 500',
  exhaustedAt: new Date('2026-11-16T10:05:00Z'),
};
const RULE_B = '0b5f2c8e-1a2b-4c3d-8e9f-0000000000a1';

const MEMBERS = new Set([`${WS_A}:${USER}`, `${WS_B}:${USER}`]);

function matches(row: object, where: object = {}): boolean {
  return Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );
}

function memoryRepo<T extends object>(rows: T[]) {
  return {
    findOne: jest.fn(
      ({ where }: { where: object }) =>
        rows.find((r) => matches(r, where)) ?? null,
    ),
    find: jest.fn(({ where }: { where?: object } = {}) =>
      rows.filter((r) => matches(r, where)),
    ),
    count: jest.fn(
      ({ where }: { where: object }) =>
        rows.filter((r) => matches(r, where)).length,
    ),
    create: jest.fn((x: object) => x),
    save: jest.fn((x: object) => ({ id: 'saved', ...x })),
    update: jest.fn(),
    remove: jest.fn((x: object) => x),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        addSelect: () => qb,
        where: () => qb,
        getOneOrFail: () => ({ signingSecret: 'whsec_test' }),
      };
      return qb;
    }),
  };
}

type Method = 'get' | 'post' | 'patch' | 'delete';
type Route = [label: string, method: Method, path: string, body?: object];

const ROUTES: Route[] = [
  ['GET /endpoints/:id', 'get', `/endpoints/${EP_B.id}`],
  ['PATCH /endpoints/:id', 'patch', `/endpoints/${EP_B.id}`, { name: 'x' }],
  [
    'GET /endpoints/:id/signing-secret',
    'get',
    `/endpoints/${EP_B.id}/signing-secret`,
  ],
  [
    'POST /endpoints/:id/signing-secret/rotate',
    'post',
    `/endpoints/${EP_B.id}/signing-secret/rotate`,
  ],
  ['DELETE /endpoints/:id', 'delete', `/endpoints/${EP_B.id}`],
  [
    'GET /endpoints/:id/destinations',
    'get',
    `/endpoints/${EP_B.id}/destinations`,
  ],
  [
    'POST /endpoints/:id/destinations',
    'post',
    `/endpoints/${EP_B.id}/destinations`,
    { url: 'https://evil.example.com/steal' },
  ],
  [
    'PATCH /endpoints/:id/destinations/:destinationId',
    'patch',
    `/endpoints/${EP_B.id}/destinations/${DEST_B.id}`,
    { label: 'x' },
  ],
  [
    'DELETE /endpoints/:id/destinations/:destinationId',
    'delete',
    `/endpoints/${EP_B.id}/destinations/${DEST_B.id}`,
  ],
  ['GET /events/:id', 'get', `/events/${EVT_B.id}`],
  ['GET /events/:id/timeline', 'get', `/events/${EVT_B.id}/timeline`],
  [
    'GET /events/:id/diff/:otherId',
    'get',
    `/events/${EVT_B.id}/diff/${EVT_B2.id}`,
  ],
  ['POST /events/:id/replay', 'post', `/events/${EVT_B.id}/replay`],
  [
    'POST /events/:id/local-deliveries',
    'post',
    `/events/${EVT_B.id}/local-deliveries`,
    {
      target: 'localhost:3000',
      status: 'forwarded',
      responseCode: 200,
      latencyMs: 5,
    },
  ],
  ['DELETE /events/:id', 'delete', `/events/${EVT_B.id}`],
  [
    'GET /endpoints/:endpointId/dead-letter',
    'get',
    `/endpoints/${EP_B.id}/dead-letter`,
  ],
  [
    'POST /endpoints/:endpointId/dead-letter/:id/retry',
    'post',
    `/endpoints/${EP_B.id}/dead-letter/${DL_B.id}/retry`,
  ],
  [
    'DELETE /endpoints/:endpointId/dead-letter/:id',
    'delete',
    `/endpoints/${EP_B.id}/dead-letter/${DL_B.id}`,
  ],
  [
    'POST /endpoints/:endpointId/transforms',
    'post',
    `/endpoints/${EP_B.id}/transforms`,
    { name: 'x', operations: [] },
  ],
  [
    'GET /endpoints/:endpointId/transforms',
    'get',
    `/endpoints/${EP_B.id}/transforms`,
  ],
  [
    'PATCH /endpoints/:endpointId/transforms/:ruleId',
    'patch',
    `/endpoints/${EP_B.id}/transforms/${RULE_B}`,
    { name: 'x' },
  ],
  [
    'DELETE /endpoints/:endpointId/transforms/:ruleId',
    'delete',
    `/endpoints/${EP_B.id}/transforms/${RULE_B}`,
  ],
];

describe('API keys are pinned to their own workspace', () => {
  let app: INestApplication<App>;
  let jwt: string;
  const ingress = {
    resolveEndpoint: jest.fn((slug: string) =>
      slug === EP_B.ingressSlug || slug === 'ws-b'
        ? { endpoint: EP_B, userId: USER }
        : null,
    ),
    capture: jest.fn((params: object) => ({ id: 'evt-test', ...params })),
    processEvent: jest.fn(),
  };
  const transforms = {
    create: jest.fn(() => ({ id: RULE_B })),
    findByEndpoint: jest.fn(() => []),
    update: jest.fn(() => ({ id: RULE_B })),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const isMember = (workspaceId: string, userId: string) =>
      Promise.resolve(MEMBERS.has(`${workspaceId}:${userId}`));
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              jwt: { secret: JWT_SECRET },
              allowPrivateForwarding: true,
              port: 3000,
            }),
          ],
        }),
      ],
      controllers: [
        EndpointsController,
        EventsController,
        DeadLetterController,
        TransformController,
        TestPayloadsController,
      ],
      providers: [
        CombinedAuthGuard,
        ApiKeyGuard,
        JwtStrategy,
        WorkspaceGuard,
        EndpointsService,
        EventsService,
        DeadLetterService,
        TestPayloadsService,
        {
          provide: ApiKeysService,
          useValue: {
            validateKey: (raw: string) =>
              ({
                [KEY_A]: { workspaceId: WS_A, createdByUserId: USER },
                [KEY_B]: { workspaceId: WS_B, createdByUserId: USER },
              })[raw] ?? null,
          },
        },
        {
          provide: WorkspacesService,
          useValue: {
            isMember,
            assertMembership: async (workspaceId: string, userId: string) => {
              if (!(await isMember(workspaceId, userId))) {
                throw new ForbiddenException('Not a member of this workspace');
              }
            },
          },
        },
        { provide: AuditService, useValue: { log: () => Promise.resolve() } },
        { provide: TransformService, useValue: transforms },
        { provide: IngressService, useValue: ingress },
        { provide: 'BullQueue_webhook-forward', useValue: { add: jest.fn() } },
        {
          provide: getRepositoryToken(Endpoint),
          useValue: memoryRepo([EP_B]),
        },
        {
          provide: getRepositoryToken(ForwardDestination),
          useValue: memoryRepo([DEST_B]),
        },
        {
          provide: getRepositoryToken(WebhookEvent),
          useValue: memoryRepo([EVT_B, EVT_B2]),
        },
        {
          provide: getRepositoryToken(ForwardResult),
          useValue: memoryRepo<object>([]),
        },
        {
          provide: getRepositoryToken(DeadLetterEvent),
          useValue: memoryRepo([DL_B]),
        },
        {
          provide: getRepositoryToken(User),
          useValue: memoryRepo([
            { id: USER, tokenVersion: 0, ingressSlug: 'usr_owner' },
          ]),
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: memoryRepo([
            { id: WS_A, slug: 'ws-a' },
            { id: WS_B, slug: 'ws-b' },
          ]),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = new JwtService({ secret: JWT_SECRET }).sign({
      sub: USER,
      email: 'owner@example.test',
    });
  });

  afterAll(() => app.close());

  beforeEach(() => jest.clearAllMocks());

  const call = (method: Method, path: string, body?: object) => {
    const req = request(app.getHttpServer())[method](path);
    return body ? req.send(body) : req;
  };

  describe.each(ROUTES)('%s', (_label, method, path, body) => {
    it("404s for workspace A's API key, though its creator is a member of B", async () => {
      // The header is ignored: the key guard pins it to the key's workspace
      await call(method, path, body)
        .set('x-api-key', KEY_A)
        .set('x-workspace-id', WS_B)
        .expect(404);
    });

    it("works for the same user's session naming workspace B", async () => {
      const res = await call(method, path, body)
        .set('authorization', `Bearer ${jwt}`)
        .set('x-workspace-id', WS_B);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it("works for workspace B's own API key", async () => {
      const res = await call(method, path, body).set('x-api-key', KEY_B);
      expect(res.status).toBeLessThan(300);
    });

    it('404s for the same session naming workspace A', async () => {
      await call(method, path, body)
        .set('authorization', `Bearer ${jwt}`)
        .set('x-workspace-id', WS_A)
        .expect(404);
    });
  });

  it('still lets a session with no workspace header reach its own events', async () => {
    await call('get', `/events/${EVT_B.id}`)
      .set('authorization', `Bearer ${jwt}`)
      .expect(200);
  });

  it('writes nothing for a cross-workspace key', async () => {
    const endpointRepo = app.get<ReturnType<typeof memoryRepo>>(
      getRepositoryToken(Endpoint),
    );
    const destinationRepo = app.get<ReturnType<typeof memoryRepo>>(
      getRepositoryToken(ForwardDestination),
    );
    await call('post', `/endpoints/${EP_B.id}/destinations`, {
      url: 'https://evil.example.com/steal',
    })
      .set('x-api-key', KEY_A)
      .expect(404);
    await call('delete', `/endpoints/${EP_B.id}`)
      .set('x-api-key', KEY_A)
      .expect(404);
    expect(destinationRepo.save).not.toHaveBeenCalled();
    expect(endpointRepo.remove).not.toHaveBeenCalled();
    expect(transforms.create).not.toHaveBeenCalled();
  });

  describe('POST /test-payloads/:provider/:eventType/send', () => {
    const send = () =>
      call('post', '/test-payloads/paystack/charge.success/send', {});

    it("never injects into workspace B's source from workspace A's key", async () => {
      await send()
        .set('x-api-key', KEY_A)
        .set('x-workspace-id', WS_B)
        .expect(201);
      expect(ingress.resolveEndpoint).toHaveBeenCalledWith('ws-a', {
        headers: {},
      });
      expect(ingress.capture).not.toHaveBeenCalled();
    });

    it("sends to workspace B's source for a session naming B", async () => {
      await send()
        .set('authorization', `Bearer ${jwt}`)
        .set('x-workspace-id', WS_B)
        .expect(201);
      expect(ingress.capture).toHaveBeenCalledWith(
        expect.objectContaining({ endpointId: EP_B.id, isTest: true }),
      );
    });

    it('answers 403 for a session naming a workspace it is not in', async () => {
      await send()
        .set('authorization', `Bearer ${jwt}`)
        .set('x-workspace-id', '0b5f2c8e-1a2b-4c3d-8e9f-0000000000cc')
        .expect(403);
      expect(ingress.capture).not.toHaveBeenCalled();
    });
  });
});
