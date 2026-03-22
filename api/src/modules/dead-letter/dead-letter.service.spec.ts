import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service.js';
import { DeadLetterEvent } from '../../entities/dead-letter-event.entity.js';
import { Endpoint } from '../../entities/endpoint.entity.js';

describe('DeadLetterService', () => {
  let service: DeadLetterService;

  const mockDeadLetterRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const mockEndpointRepo = {
    findOne: jest.fn(),
  };
  const mockForwardQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: getRepositoryToken(DeadLetterEvent),
          useValue: mockDeadLetterRepo,
        },
        {
          provide: getRepositoryToken(Endpoint),
          useValue: mockEndpointRepo,
        },
        { provide: 'BullQueue_webhook-forward', useValue: mockForwardQueue },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return dead letters for endpoint', async () => {
      const endpoint = { id: 'ep-1', userId: 'user-1' };
      const deadLetters = [
        { id: 'dl-1', eventId: 'evt-1', endpointId: 'ep-1' },
        { id: 'dl-2', eventId: 'evt-2', endpointId: 'ep-1' },
      ];
      mockEndpointRepo.findOne.mockResolvedValue(endpoint);
      mockDeadLetterRepo.find.mockResolvedValue(deadLetters);

      const result = await service.list('ep-1', 'user-1');

      expect(result).toEqual(deadLetters);
      expect(mockEndpointRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'ep-1', userId: 'user-1' },
      });
      expect(mockDeadLetterRepo.find).toHaveBeenCalledWith({
        where: { endpointId: 'ep-1' },
        relations: ['event'],
        order: { exhaustedAt: 'DESC' },
      });
    });

    it('should throw NotFoundException when endpoint not found', async () => {
      mockEndpointRepo.findOne.mockResolvedValue(null);

      await expect(service.list('ep-999', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for wrong user', async () => {
      mockEndpointRepo.findOne.mockResolvedValue(null);

      await expect(service.list('ep-1', 'user-wrong')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('retry', () => {
    it('should re-queue job and remove dead letter', async () => {
      const endpoint = { id: 'ep-1', userId: 'user-1' };
      const deadLetter = {
        id: 'dl-1',
        eventId: 'evt-1',
        endpointId: 'ep-1',
        destinationId: 'dest-1',
      };
      mockEndpointRepo.findOne.mockResolvedValue(endpoint);
      mockDeadLetterRepo.findOne.mockResolvedValue(deadLetter);
      mockForwardQueue.add.mockResolvedValue({});
      mockDeadLetterRepo.remove.mockResolvedValue(deadLetter);

      await service.retry('ep-1', 'dl-1', 'user-1');

      expect(mockForwardQueue.add).toHaveBeenCalledWith('forward', {
        eventId: 'evt-1',
        endpointId: 'ep-1',
        userId: 'user-1',
        destinationId: 'dest-1',
      });
      expect(mockDeadLetterRepo.remove).toHaveBeenCalledWith(deadLetter);
    });

    it('should pass undefined destinationId when null', async () => {
      const endpoint = { id: 'ep-1', userId: 'user-1' };
      const deadLetter = {
        id: 'dl-1',
        eventId: 'evt-1',
        endpointId: 'ep-1',
        destinationId: null,
      };
      mockEndpointRepo.findOne.mockResolvedValue(endpoint);
      mockDeadLetterRepo.findOne.mockResolvedValue(deadLetter);
      mockForwardQueue.add.mockResolvedValue({});
      mockDeadLetterRepo.remove.mockResolvedValue(deadLetter);

      await service.retry('ep-1', 'dl-1', 'user-1');

      expect(mockForwardQueue.add).toHaveBeenCalledWith('forward', {
        eventId: 'evt-1',
        endpointId: 'ep-1',
        userId: 'user-1',
        destinationId: undefined,
      });
    });

    it('should throw NotFoundException when endpoint not found', async () => {
      mockEndpointRepo.findOne.mockResolvedValue(null);

      await expect(
        service.retry('ep-999', 'dl-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when dead letter not found', async () => {
      mockEndpointRepo.findOne.mockResolvedValue({
        id: 'ep-1',
        userId: 'user-1',
      });
      mockDeadLetterRepo.findOne.mockResolvedValue(null);

      await expect(
        service.retry('ep-1', 'dl-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('discard', () => {
    it('should remove dead letter', async () => {
      const endpoint = { id: 'ep-1', userId: 'user-1' };
      const deadLetter = { id: 'dl-1', eventId: 'evt-1', endpointId: 'ep-1' };
      mockEndpointRepo.findOne.mockResolvedValue(endpoint);
      mockDeadLetterRepo.findOne.mockResolvedValue(deadLetter);
      mockDeadLetterRepo.remove.mockResolvedValue(deadLetter);

      await service.discard('ep-1', 'dl-1', 'user-1');

      expect(mockDeadLetterRepo.remove).toHaveBeenCalledWith(deadLetter);
      expect(mockForwardQueue.add).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when endpoint not found', async () => {
      mockEndpointRepo.findOne.mockResolvedValue(null);

      await expect(
        service.discard('ep-999', 'dl-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when dead letter not found', async () => {
      mockEndpointRepo.findOne.mockResolvedValue({
        id: 'ep-1',
        userId: 'user-1',
      });
      mockDeadLetterRepo.findOne.mockResolvedValue(null);

      await expect(
        service.discard('ep-1', 'dl-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
