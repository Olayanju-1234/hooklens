import { HttpException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TestPayloadsController } from './test-payloads.controller.js';
import { TestPayloadsService } from './test-payloads.service.js';
import type { JwtPayload } from '../../common/decorators/current-user.decorator.js';

const JWT = { sub: 'user-1' } as JwtPayload;
const SOURCE = {
  id: 'ep-1',
  userId: 'user-1',
  provider: 'paystack',
  ingressSlug: 'src_0123456789abcdef01234567',
  responseStatusCode: 202,
  responseBody: '{"received":true}',
};

describe('TestPayloadsController.sendTestPayload', () => {
  const userRepo = { findOne: jest.fn() };
  const endpointRepo = { findOne: jest.fn() };
  const ingress = {
    resolveEndpoint: jest.fn(),
    capture: jest.fn(),
    processEvent: jest.fn(),
  };
  const config = { get: jest.fn(() => 3001) } as unknown as ConfigService;
  let controller: TestPayloadsController;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findOne.mockResolvedValue({
      id: 'user-1',
      ingressSlug: 'usr_0123456789ab',
    });
    endpointRepo.findOne.mockResolvedValue(SOURCE);
    ingress.resolveEndpoint.mockResolvedValue({
      endpoint: SOURCE,
      userId: 'user-1',
    });
    ingress.capture.mockResolvedValue({ id: 'evt-1' });
    ingress.processEvent.mockResolvedValue(undefined);
    controller = new TestPayloadsController(
      new TestPayloadsService(),
      config,
      userRepo as never,
      endpointRepo as never,
      ingress as never,
    );
  });

  it('captures the template in-process as a test event and keeps the response fields', async () => {
    const result = await controller.sendTestPayload(
      JWT,
      'paystack',
      'charge.success',
      {},
    );

    expect(ingress.resolveEndpoint).toHaveBeenCalledWith(SOURCE.ingressSlug, {
      headers: {},
    });
    const params = (ingress.capture.mock.calls as unknown[][])[0][0] as {
      isTest: boolean;
      endpointId: string;
      rawBody: string;
      body: { event: string };
    };
    expect(params.isTest).toBe(true);
    expect(params.endpointId).toBe('ep-1');
    expect(params.body.event).toBe('charge.success');
    expect(JSON.parse(params.rawBody)).toEqual(params.body);
    expect(ingress.processEvent).toHaveBeenCalledWith({ id: 'evt-1' }, SOURCE, {
      urls: [`http://localhost:3001/in/${SOURCE.ingressSlug}`],
    });
    expect(result).toEqual({
      sent: true,
      provider: 'paystack',
      eventType: 'charge.success',
      ingressUrl: `http://localhost:3001/in/${SOURCE.ingressSlug}`,
      eventId: 'evt-1',
      responseStatus: 202,
      responseBody: { received: true },
    });
  });

  it('sends a custom body when one is given', async () => {
    await controller.sendTestPayload(JWT, 'paystack', 'charge.success', {
      event: 'custom.thing',
    });
    expect((ingress.capture.mock.calls as unknown[][])[0][0]).toMatchObject({
      body: { event: 'custom.thing' },
      isTest: true,
    });
  });

  it("falls back to the user's shared URL when no source matches the provider", async () => {
    endpointRepo.findOne.mockResolvedValue(null);
    await controller.sendTestPayload(JWT, 'paystack', 'charge.success', {});
    expect(ingress.resolveEndpoint).toHaveBeenCalledWith('usr_0123456789ab', {
      headers: {},
    });
  });

  it('captures nothing when no source resolves, answering like the ingress would', async () => {
    ingress.resolveEndpoint.mockResolvedValue(null);
    const result = await controller.sendTestPayload(
      JWT,
      'paystack',
      'charge.success',
      {},
    );
    expect(ingress.capture).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      sent: true,
      eventId: null,
      responseStatus: 200,
      responseBody: { status: 'ok' },
    });
  });

  it('answers 502 when capturing fails', async () => {
    ingress.capture.mockRejectedValue(new Error('db down'));
    await expect(
      controller.sendTestPayload(JWT, 'paystack', 'charge.success', {}),
    ).rejects.toBeInstanceOf(HttpException);
    expect(ingress.processEvent).not.toHaveBeenCalled();
  });

  it('404s an unknown user', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      controller.sendTestPayload(JWT, 'paystack', 'charge.success', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
