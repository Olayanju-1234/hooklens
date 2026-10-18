import * as crypto from 'crypto';
import type { Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import { IngressService } from './ingress.service.js';
import { SignatureService } from '../signature/signature.service.js';
import type { WebhookGateway } from '../websocket/webhook.gateway.js';
import type { AlertingService } from '../alerting/alerting.service.js';
import type { ForwardJobData } from '../forward/forward.processor.js';
import type { User } from '../../entities/user.entity.js';
import type { Endpoint } from '../../entities/endpoint.entity.js';
import type { WebhookEvent } from '../../entities/webhook-event.entity.js';
import type { Workspace } from '../../entities/workspace.entity.js';

const SECRET = 'gh_secret';
const RAW_BODY = '{"ref":"refs/heads/main"}';

function githubHeaders(secret: string): Record<string, string> {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(RAW_BODY)
    .digest('hex');
  return {
    'x-github-event': 'push',
    'x-hub-signature-256': `sha256=${digest}`,
  };
}

describe('IngressService.processEvent', () => {
  let eventRepo: { update: jest.Mock };
  let wsGateway: { broadcastWebhook: jest.Mock };
  let alerting: { evaluateSignatureFailure: jest.Mock };
  let forwardQueue: { add: jest.Mock };
  let service: IngressService;

  const endpoint = (overrides: Partial<Endpoint>) =>
    ({
      id: 'ep-1',
      userId: 'user-1',
      provider: 'github',
      webhookSecret: SECRET,
      blockInvalidSignatures: false,
      ...overrides,
    }) as Endpoint;

  const event = (headers: Record<string, string>) =>
    ({
      id: 'evt-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
      method: 'POST',
      path: '/in/src_x',
      headers,
      body: JSON.parse(RAW_BODY) as Record<string, unknown>,
      rawBody: RAW_BODY,
      receivedAt: new Date(),
      forwardStatus: 'pending',
    }) as WebhookEvent;

  const savedUpdates = () =>
    eventRepo.update.mock.calls.map(([, changes]) => changes as object);

  beforeEach(() => {
    eventRepo = { update: jest.fn().mockResolvedValue(undefined) };
    wsGateway = { broadcastWebhook: jest.fn() };
    alerting = { evaluateSignatureFailure: jest.fn().mockResolvedValue(null) };
    forwardQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new IngressService(
      {} as Repository<User>,
      {} as Repository<Endpoint>,
      eventRepo as unknown as Repository<WebhookEvent>,
      {} as Repository<Workspace>,
      new SignatureService(),
      wsGateway as unknown as WebhookGateway,
      alerting as unknown as AlertingService,
      forwardQueue as unknown as Queue<ForwardJobData>,
    );
  });

  it('blocks an invalid signature at the gate when blocking is on', async () => {
    await service.processEvent(
      event(githubHeaders('gh_wrong')),
      endpoint({ blockInvalidSignatures: true }),
    );

    expect(savedUpdates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signatureValid: false }),
        { forwardStatus: 'blocked' },
      ]),
    );
    expect(forwardQueue.add).not.toHaveBeenCalled();
    expect(wsGateway.broadcastWebhook).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        signatureValid: false,
        forwardStatus: 'blocked',
      }),
    );
  });

  it('forwards a valid signature when blocking is on', async () => {
    await service.processEvent(
      event(githubHeaders(SECRET)),
      endpoint({ blockInvalidSignatures: true }),
    );

    expect(savedUpdates()).toEqual([
      expect.objectContaining({ signatureValid: true }),
    ]);
    expect(forwardQueue.add).toHaveBeenCalledWith(
      'forward',
      { eventId: 'evt-1', endpointId: 'ep-1', userId: 'user-1' },
      expect.anything(),
    );
    expect(wsGateway.broadcastWebhook).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        signatureValid: true,
        forwardStatus: 'pending',
      }),
    );
  });

  it('records and forwards an invalid signature, marked invalid, when blocking is off', async () => {
    await service.processEvent(
      event(githubHeaders('gh_wrong')),
      endpoint({ blockInvalidSignatures: false }),
    );

    expect(savedUpdates()).toEqual([
      expect.objectContaining({ signatureValid: false }),
    ]);
    expect(forwardQueue.add).toHaveBeenCalledTimes(1);
    expect(alerting.evaluateSignatureFailure).toHaveBeenCalledWith(
      'ws-1',
      'evt-1',
    );
  });

  it('cannot block without a secret, so it forwards unverified', async () => {
    await service.processEvent(
      event(githubHeaders('gh_wrong')),
      endpoint({ webhookSecret: null, blockInvalidSignatures: true }),
    );

    const updates = savedUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty('signatureValid');
    expect(forwardQueue.add).toHaveBeenCalledTimes(1);
  });
});
