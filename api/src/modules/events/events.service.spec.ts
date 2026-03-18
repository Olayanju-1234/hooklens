import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { WebhookEvent } from '../../entities/webhook-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';
import { ForwardResult } from '../../entities/forward-result.entity.js';

describe('EventsService', () => {
  let service: EventsService;

  const mockEventRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockEndpointRepo = {
    findOne: jest.fn(),
  };
  const mockForwardResultRepo = {
    find: jest.fn(),
  };
  const mockForwardQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(WebhookEvent), useValue: mockEventRepo },
        { provide: getRepositoryToken(Endpoint), useValue: mockEndpointRepo },
        {
          provide: getRepositoryToken(ForwardResult),
          useValue: mockForwardResultRepo,
        },
        { provide: 'BullQueue_webhook-forward', useValue: mockForwardQueue },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return event owned by user', async () => {
      const event = { id: 'evt-1', userId: 'user-1', body: {} };
      mockEventRepo.findOne.mockResolvedValue(event);

      const result = await service.findOne('evt-1', 'user-1');
      expect(result).toEqual(event);
    });

    it('should throw NotFoundException for non-existent event', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('evt-999', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for wrong user', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-2',
      });
      await expect(service.findOne('evt-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('diff', () => {
    it('should compute differences between two event bodies', async () => {
      const event1 = {
        id: 'evt-1',
        userId: 'user-1',
        body: { amount: 1000, status: 'pending', currency: 'NGN' },
        headers: { 'content-type': 'application/json' },
        receivedAt: new Date('2026-01-01'),
      };
      const event2 = {
        id: 'evt-2',
        userId: 'user-1',
        body: { amount: 1000, status: 'success', ref: 'abc' },
        headers: { 'content-type': 'application/json' },
        receivedAt: new Date('2026-01-02'),
      };

      mockEventRepo.findOne
        .mockResolvedValueOnce(event1)
        .mockResolvedValueOnce(event2);

      const result = await service.diff('evt-1', 'evt-2', 'user-1');

      expect(result.bodyDiff.status).toEqual({
        old: 'pending',
        new: 'success',
        status: 'changed',
      });
      expect(result.bodyDiff.currency).toEqual({
        old: 'NGN',
        new: undefined,
        status: 'removed',
      });
      expect(result.bodyDiff.ref).toEqual({
        old: undefined,
        new: 'abc',
        status: 'added',
      });
      expect(result.bodyDiff.amount).toBeUndefined(); // unchanged
    });
  });

  describe('replay', () => {
    it('should create a replay event and queue forward', async () => {
      const original = {
        id: 'evt-1',
        endpointId: 'ep-1',
        userId: 'user-1',
        method: 'POST',
        path: '/in/usr_abc',
        headers: {},
        body: { event: 'charge.success' },
        rawBody: '{}',
        sourceIp: '1.2.3.4',
        provider: 'paystack',
        eventType: 'charge.success',
        signatureValid: true,
        forwardStatus: 'forwarded' as const,
        receivedAt: new Date(),
      };
      const endpoint = { id: 'ep-1', forwardUrl: 'https://example.com/hook' };

      mockEventRepo.findOne.mockResolvedValue(original);
      mockEndpointRepo.findOne.mockResolvedValue(endpoint);
      mockEventRepo.create.mockImplementation(
        (data: Partial<WebhookEvent>) => data,
      );
      mockEventRepo.save.mockImplementation((data: Partial<WebhookEvent>) => ({
        ...data,
        id: 'evt-replay-1',
      }));

      const result = await service.replay('evt-1', 'user-1');

      expect(result.isReplay).toBe(true);
      expect(result.originalEventId).toBe('evt-1');
      expect(result.forwardStatus).toBe('pending');
      expect(mockForwardQueue.add).toHaveBeenCalledWith('forward', {
        eventId: 'evt-replay-1',
        endpointId: 'ep-1',
        userId: 'user-1',
      });
    });
  });
});
