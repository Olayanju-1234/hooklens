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

describe('reply settings on the endpoint DTOs', () => {
  const bodies = [
    [
      'CreateEndpointDto',
      CreateEndpointDto,
      { name: 'GH', provider: 'github' },
    ],
    ['UpdateEndpointDto', UpdateEndpointDto, {}],
  ] as const;

  it.each(bodies)('%s accepts a 2xx status', async (_label, cls, base) => {
    for (const value of [200, 202, 204, 299]) {
      const dto = await parse<{ responseStatusCode?: number }>(cls, {
        ...base,
        responseStatusCode: value,
      });
      expect(dto.responseStatusCode).toBe(value);
    }
  });

  it.each(bodies)(
    '%s rejects a status outside 2xx',
    async (_label, cls, base) => {
      for (const value of [199, 301, 400, 500, 202.5, '202']) {
        await expect(
          parse(cls, { ...base, responseStatusCode: value }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  it.each(bodies)(
    '%s accepts a JSON object or array body',
    async (_label, cls, base) => {
      for (const value of ['{"received":true}', '[1,2]']) {
        const dto = await parse<{ responseBody?: string }>(cls, {
          ...base,
          responseBody: value,
        });
        expect(dto.responseBody).toBe(value);
      }
    },
  );

  it.each(bodies)(
    '%s rejects a body ingress would not send',
    async (_label, cls, base) => {
      const tooLong = JSON.stringify({ pad: 'x'.repeat(4096) });
      for (const value of ['ok', '', '42', '"ok"', '{bad', tooLong, 12]) {
        await expect(
          parse(cls, { ...base, responseBody: value }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  it('UpdateEndpointDto accepts a null body to reset the reply', async () => {
    const dto = await parse(UpdateEndpointDto, { responseBody: null });
    expect(dto.responseBody).toBeNull();
  });
});

// In-memory endpoint repo, enough for create, findOne and update
function fakeService() {
  const rows = new Map<string, Endpoint>();
  const endpointRepo = {
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
  const service = new EndpointsService(
    endpointRepo as unknown as Repository<Endpoint>,
    {} as Repository<ForwardDestination>,
    { isMember: jest.fn() } as unknown as WorkspacesService,
    { get: jest.fn() } as unknown as ConfigService,
  );
  return { rows, endpointRepo, service };
}

describe('EndpointsService blockInvalidSignatures', () => {
  let rows: ReturnType<typeof fakeService>['rows'];
  let endpointRepo: ReturnType<typeof fakeService>['endpointRepo'];
  let service: EndpointsService;

  beforeEach(() => {
    ({ rows, endpointRepo, service } = fakeService());
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

describe('EndpointsService reply settings', () => {
  let rows: ReturnType<typeof fakeService>['rows'];
  let endpointRepo: ReturnType<typeof fakeService>['endpointRepo'];
  let service: EndpointsService;

  beforeEach(() => {
    ({ rows, endpointRepo, service } = fakeService());
  });

  it('saves them on create', async () => {
    const dto = await parse(CreateEndpointDto, {
      name: 'GH',
      provider: 'github',
      responseStatusCode: 202,
      responseBody: '{"received":true}',
    });
    const created = await service.create('user-1', dto, 'ws-1');

    expect(rows.get(created.id)).toMatchObject({
      responseStatusCode: 202,
      responseBody: '{"received":true}',
    });
  });

  it('defaults to 200 and no body on create', async () => {
    const created = await service.create(
      'user-1',
      { name: 'GH', provider: 'github' },
      'ws-1',
    );
    expect(rows.get(created.id)).toMatchObject({
      responseStatusCode: 200,
      responseBody: null,
    });
  });

  it('changes them through update and keeps them when left out', async () => {
    const { id } = await service.create(
      'user-1',
      { name: 'GH', provider: 'github' },
      'ws-1',
    );
    await service.update(
      id,
      'user-1',
      await parse(UpdateEndpointDto, {
        responseStatusCode: 204,
        responseBody: '{"ok":1}',
      }),
    );
    const renamed = await service.update(
      id,
      'user-1',
      await parse(UpdateEndpointDto, { name: 'Renamed' }),
    );

    expect(endpointRepo.update).toHaveBeenLastCalledWith(id, {
      name: 'Renamed',
    });
    expect(renamed).toMatchObject({
      name: 'Renamed',
      responseStatusCode: 204,
      responseBody: '{"ok":1}',
    });
  });

  it('clears the body when an update sends null', async () => {
    const { id } = await service.create(
      'user-1',
      { name: 'GH', provider: 'github', responseBody: '{"ok":1}' },
      'ws-1',
    );
    const updated = await service.update(
      id,
      'user-1',
      await parse(UpdateEndpointDto, { responseBody: null }),
    );
    expect(updated.responseBody).toBeNull();
  });
});
