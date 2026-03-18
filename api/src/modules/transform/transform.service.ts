import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransformRule } from '../../entities/transform-rule.entity.js';
import {
  CreateTransformRuleDto,
  UpdateTransformRuleDto,
  TransformOperationDto,
} from './dto/transform.dto.js';

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      current[key] === null ||
      current[key] === undefined ||
      typeof current[key] !== 'object'
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      current[key] === null ||
      current[key] === undefined ||
      typeof current[key] !== 'object'
    ) {
      return;
    }
    current = current[key] as Record<string, unknown>;
  }
  delete current[keys[keys.length - 1]];
}

function applyOperations(
  operations: TransformOperationDto[],
  body: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = JSON.parse(
    JSON.stringify(body),
  ) as Record<string, unknown>;

  for (const op of operations) {
    switch (op.type) {
      case 'rename': {
        if (!op.newPath) break;
        const value = getByPath(result, op.path);
        if (value !== undefined) {
          setByPath(result, op.newPath, value);
          deleteByPath(result, op.path);
        }
        break;
      }
      case 'remove': {
        deleteByPath(result, op.path);
        break;
      }
      case 'set': {
        setByPath(result, op.path, op.value);
        break;
      }
      case 'copy': {
        if (!op.newPath) break;
        const val = getByPath(result, op.path);
        if (val !== undefined) {
          setByPath(result, op.newPath, val);
        }
        break;
      }
    }
  }

  return result;
}

@Injectable()
export class TransformService {
  private readonly logger = new Logger(TransformService.name);

  constructor(
    @InjectRepository(TransformRule)
    private readonly ruleRepo: Repository<TransformRule>,
  ) {}

  async create(
    endpointId: string,
    dto: CreateTransformRuleDto,
  ): Promise<TransformRule> {
    const rule = this.ruleRepo.create({
      endpointId,
      name: dto.name,
      operations: dto.operations,
      priority: dto.priority ?? 0,
    });
    const saved = await this.ruleRepo.save(rule);
    this.logger.log(
      `Transform rule created: ${saved.id} for endpoint ${endpointId}`,
    );
    return saved;
  }

  async findByEndpoint(endpointId: string): Promise<TransformRule[]> {
    return this.ruleRepo.find({
      where: { endpointId },
      order: { priority: 'ASC' },
    });
  }

  async update(
    ruleId: string,
    dto: UpdateTransformRuleDto,
  ): Promise<TransformRule> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('Transform rule not found');
    }
    Object.assign(rule, dto);
    const updated = await this.ruleRepo.save(rule);
    this.logger.log(`Transform rule updated: ${ruleId}`);
    return updated;
  }

  async remove(ruleId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('Transform rule not found');
    }
    await this.ruleRepo.remove(rule);
    this.logger.log(`Transform rule deleted: ${ruleId}`);
  }

  async applyTransforms(
    endpointId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const rules = await this.ruleRepo.find({
      where: { endpointId, isActive: true },
      order: { priority: 'ASC' },
    });

    if (rules.length === 0) {
      return body;
    }

    let result: Record<string, unknown> = JSON.parse(
      JSON.stringify(body),
    ) as Record<string, unknown>;
    for (const rule of rules) {
      result = applyOperations(
        rule.operations as TransformOperationDto[],
        result,
      );
    }

    this.logger.log(
      `Applied ${rules.length} transform rules for endpoint ${endpointId}`,
    );
    return result;
  }

  testTransform(
    operations: TransformOperationDto[],
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    return applyOperations(operations, body);
  }
}
