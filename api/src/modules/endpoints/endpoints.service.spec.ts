import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { EndpointsService } from './endpoints.service.js';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/endpoint.dto.js';
import type { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { Endpoint } from '../../entities/endpoint.entity.js';
import type { ForwardDestination } from '../../entities/forward-destination.entity.js';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

function parse<T>(metatype: new () => T, body: object): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype }) as Promise<T>;
}

describe('blockInvalidSignatures on the endpoint DTOs', () => {
  it.each([
    [
      'CreateEndpointDto',
      CreateEndpointDto,
      { name: 'GH', provider: 'github' },
    ],
    ['UpdateEndpointDto', UpdateEndpointDto, {}],
  ] as const)('%s accepts it', async (_label, cls, base) => {
    for (const value of [true, false]) {
      const dto = await parse<{ blockInvalidSignatures?: boolean }>(cls, {
        ...base,
        blockInvalidSignatures: value,
      });
      expect(dto.blockInvalidSignatures).toBe(value);
    }
  });

  it.each([
    [
      'CreateEndpointDto',
      CreateEndpointDto,
      { name: 'GH', provider: 'github' },
    ],
    ['UpdateEndpointDto', UpdateEndpointDto, {}],
  ] as const)('%s rejects a non-boolean', async (_label, cls, base) => {
    await expect(
      parse(cls, { ...base, blockInvalidSignatures: 'yes' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EndpointsService blockInvalidSignatures', () => {
  let rows: Map<string, Endpoint>;
  let endpointRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let service: EndpointsService;

  beforeEach(() => {
    rows = new Map();
    endpointRepo = {
      create: jest.fn((data: Partial<Endpoint>) => ({ ...data })),
      save: jest.fn((ep: Endpoint) => {
        const saved = { ...ep, id: ep.id ?? `ep-${rows.size + 1}` };
        rows.set(saved.id, saved);
        return Promise.resolve(saved);
      }),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.has(where.id) ? { ...rows.get(where.id) } : null),
      ),
      update: jest.fn((id: string, changes: Partial<Endpoint>) => {
        rows.set(id, { ...rows.get(id)!, ...changes });
        return Promise.resolve(undefined);
      }),
    };
    service = new EndpointsService(
      endpointRepo as unknown as Repository<Endpoint>,
      {} as Repository<ForwardDestination>,
      { isMember: jest.fn() } as unknown as WorkspacesService,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  it('saves it on create', async () => {
    const created = await service.create(
      'user-1',
      { name: 'GH', provider: 'github', blockInvalidSignatures: true },
      'ws-1',
    );
    expect(rows.get(created.id)?.blockInvalidSignatures).toBe(true);
  });

  it('defaults to false on create', async () => {
    const created = await service.create(
      'user-1',
      { name: 'GH', provider: 'github' },
      'ws-1',
    );
    expect(rows.get(created.id)?.blockInvalidSignatures).toBe(false);
  });

  it('turns it on and off through update', async () => {
    const { id } = await service.create(
      'user-1',
      { name: 'GH', provider: 'github' },
      'ws-1',
    );
    const on = await service.update(id, 'user-1', {
      blockInvalidSignatures: true,
    });
    expect(on.blockInvalidSignatures).toBe(true);
    const off = await service.update(id, 'user-1', {
      blockInvalidSignatures: false,
    });
    expect(off.blockInvalidSignatures).toBe(false);
  });

  it('keeps the old value when an update leaves it out', async () => {
    const { id } = await service.create(
      'user-1',
      { name: 'GH', provider: 'github', blockInvalidSignatures: true },
      'ws-1',
    );
    const dto = await parse(UpdateEndpointDto, {
      name: 'Renamed',
      retryMaxAttempts: 5,
    });
    const updated = await service.update(id, 'user-1', dto);

    expect(endpointRepo.update).toHaveBeenCalledWith(id, {
      name: 'Renamed',
      retryMaxAttempts: 5,
    });
    expect(updated.name).toBe('Renamed');
    expect(updated.blockInvalidSignatures).toBe(true);
  });
});
