import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TransformService } from './transform.service.js';
import { TransformRule } from '../../entities/transform-rule.entity.js';

describe('TransformService', () => {
  let service: TransformService;

  const mockRuleRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransformService,
        {
          provide: getRepositoryToken(TransformRule),
          useValue: mockRuleRepo,
        },
      ],
    }).compile();

    service = module.get<TransformService>(TransformService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a transform rule with default priority', async () => {
      mockRuleRepo.create.mockImplementation(
        (data: Partial<TransformRule>) => data,
      );
      mockRuleRepo.save.mockImplementation(
        (rule: Partial<TransformRule>) => ({
          ...rule,
          id: 'rule-uuid',
        }),
      );

      const result = await service.create('ep-1', {
        name: 'Normalize payload',
        operations: [{ type: 'remove', path: 'meta.debug' }],
      });

      expect(result.id).toBe('rule-uuid');
      expect(result.endpointId).toBe('ep-1');
      expect(result.name).toBe('Normalize payload');
      expect(result.priority).toBe(0);
    });

    it('should create a transform rule with explicit priority', async () => {
      mockRuleRepo.create.mockImplementation(
        (data: Partial<TransformRule>) => data,
      );
      mockRuleRepo.save.mockImplementation(
        (rule: Partial<TransformRule>) => ({
          ...rule,
          id: 'rule-uuid',
        }),
      );

      const result = await service.create('ep-1', {
        name: 'High priority rule',
        operations: [{ type: 'set', path: 'source', value: 'webhook' }],
        priority: 10,
      });

      expect(result.priority).toBe(10);
    });
  });

  describe('findByEndpoint', () => {
    it('should return rules ordered by priority', async () => {
      const rules = [
        { id: 'r-1', priority: 0, name: 'First' },
        { id: 'r-2', priority: 5, name: 'Second' },
      ];
      mockRuleRepo.find.mockResolvedValue(rules);

      const result = await service.findByEndpoint('ep-1');

      expect(result).toEqual(rules);
      expect(mockRuleRepo.find).toHaveBeenCalledWith({
        where: { endpointId: 'ep-1' },
        order: { priority: 'ASC' },
      });
    });
  });

  describe('update', () => {
    it('should update transform rule fields', async () => {
      const rule = {
        id: 'r-1',
        name: 'Old Name',
        operations: [],
        isActive: true,
        priority: 0,
      };
      mockRuleRepo.findOne.mockResolvedValue(rule);
      mockRuleRepo.save.mockImplementation(
        (r: Partial<TransformRule>) => r,
      );

      const result = await service.update('r-1', {
        name: 'Updated Name',
        isActive: false,
      });

      expect(result.name).toBe('Updated Name');
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException when rule not found', async () => {
      mockRuleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('r-999', { name: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete transform rule', async () => {
      const rule = { id: 'r-1', name: 'To Delete' };
      mockRuleRepo.findOne.mockResolvedValue(rule);
      mockRuleRepo.remove.mockResolvedValue(rule);

      await service.remove('r-1');

      expect(mockRuleRepo.remove).toHaveBeenCalledWith(rule);
    });

    it('should throw NotFoundException when rule not found', async () => {
      mockRuleRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('r-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('applyTransforms', () => {
    it('should return body unchanged when no active rules exist', async () => {
      mockRuleRepo.find.mockResolvedValue([]);

      const body = { amount: 1000, status: 'success' };
      const result = await service.applyTransforms('ep-1', body);

      expect(result).toEqual(body);
    });

    it('should apply rename operation', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          operations: [
            { type: 'rename', path: 'amount', newPath: 'total' },
          ],
        },
      ]);

      const result = await service.applyTransforms('ep-1', {
        amount: 1000,
        currency: 'NGN',
      });

      expect(result.total).toBe(1000);
      expect(result.amount).toBeUndefined();
      expect(result.currency).toBe('NGN');
    });

    it('should apply remove operation', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          operations: [{ type: 'remove', path: 'meta.debug' }],
        },
      ]);

      const result = await service.applyTransforms('ep-1', {
        data: 'value',
        meta: { debug: true, version: '1.0' },
      });

      expect(result.data).toBe('value');
      expect((result.meta as Record<string, unknown>).debug).toBeUndefined();
      expect((result.meta as Record<string, unknown>).version).toBe('1.0');
    });

    it('should apply set operation', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          operations: [
            { type: 'set', path: 'source', value: 'webhook' },
          ],
        },
      ]);

      const result = await service.applyTransforms('ep-1', { data: 'test' });

      expect(result.source).toBe('webhook');
      expect(result.data).toBe('test');
    });

    it('should apply copy operation', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          operations: [
            { type: 'copy', path: 'data.id', newPath: 'refId' },
          ],
        },
      ]);

      const result = await service.applyTransforms('ep-1', {
        data: { id: 'abc-123', name: 'Test' },
      });

      expect(result.refId).toBe('abc-123');
      expect((result.data as Record<string, unknown>).id).toBe('abc-123');
    });

    it('should apply multiple rules in priority order', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          priority: 0,
          operations: [
            { type: 'rename', path: 'amount', newPath: 'total' },
          ],
        },
        {
          id: 'r-2',
          priority: 1,
          operations: [
            { type: 'set', path: 'processed', value: true },
          ],
        },
      ]);

      const result = await service.applyTransforms('ep-1', {
        amount: 500,
      });

      expect(result.total).toBe(500);
      expect(result.amount).toBeUndefined();
      expect(result.processed).toBe(true);
    });

    it('should not mutate the original body', async () => {
      mockRuleRepo.find.mockResolvedValue([
        {
          id: 'r-1',
          operations: [{ type: 'set', path: 'injected', value: true }],
        },
      ]);

      const body = { amount: 1000 };
      await service.applyTransforms('ep-1', body);

      expect(body).toEqual({ amount: 1000 });
    });
  });

  describe('testTransform', () => {
    it('should apply operations without persisting', () => {
      const result = service.testTransform(
        [
          { type: 'rename', path: 'old_field', newPath: 'new_field' },
          { type: 'remove', path: 'secret' },
          { type: 'set', path: 'version', value: 2 },
        ],
        { old_field: 'hello', secret: 'shh', keep: true },
      );

      expect(result.new_field).toBe('hello');
      expect(result.old_field).toBeUndefined();
      expect(result.secret).toBeUndefined();
      expect(result.version).toBe(2);
      expect(result.keep).toBe(true);
    });
  });
});
