import { ForbiddenException } from '@nestjs/common';
import { BagsService } from './bags.service.js';

describe('BagsService.getEventStats scope', () => {
  const wheres: Array<[string, Record<string, unknown>]> = [];
  const qb = {
    select: () => qb,
    addSelect: () => qb,
    where: (clause: string, params: Record<string, unknown>) => {
      wheres.push([clause, params]);
      return qb;
    },
    andWhere: () => qb,
    groupBy: () => qb,
    orderBy: () => qb,
    limit: () => qb,
    getCount: () => Promise.resolve(2),
    getRawMany: () => Promise.resolve([{ eventType: 'launch', count: '2' }]),
  };
  const eventRepo = {
    count: jest.fn(() => Promise.resolve(3)),
    createQueryBuilder: jest.fn(() => qb),
  };
  const workspaces = { assertMembership: jest.fn() };
  const config = { get: jest.fn(() => undefined) };
  let service: BagsService;

  beforeEach(() => {
    jest.clearAllMocks();
    wheres.length = 0;
    workspaces.assertMembership.mockResolvedValue(undefined);
    service = new BagsService(
      config as never,
      {} as never,
      eventRepo as never,
      {} as never,
      {} as never,
      workspaces as never,
    );
  });

  it("counts the request workspace's events, not the user's across workspaces", async () => {
    const stats = await service.getEventStats('user-1', 'ws-a');

    expect(workspaces.assertMembership).toHaveBeenCalledWith('ws-a', 'user-1');
    expect(eventRepo.count).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-a', provider: 'bags' },
    });
    expect(wheres).toEqual([
      ['e.workspaceId = :workspaceId', { workspaceId: 'ws-a' }],
      ['e.workspaceId = :workspaceId', { workspaceId: 'ws-a' }],
    ]);
    expect(stats).toEqual({
      total: 3,
      last24h: 2,
      byEventType: [{ eventType: 'launch', count: 2 }],
    });
  });

  it('refuses a workspace the user is not in', async () => {
    workspaces.assertMembership.mockRejectedValue(new ForbiddenException());
    await expect(
      service.getEventStats('user-1', 'ws-other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(eventRepo.count).not.toHaveBeenCalled();
  });

  it("keeps a request without a workspace to the user's own events", async () => {
    await service.getEventStats('user-1');
    expect(workspaces.assertMembership).not.toHaveBeenCalled();
    expect(eventRepo.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', provider: 'bags' },
    });
    expect(wheres[0]).toEqual(['e.userId = :userId', { userId: 'user-1' }]);
  });
});
