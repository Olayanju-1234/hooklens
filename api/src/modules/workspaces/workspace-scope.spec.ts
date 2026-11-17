import { canReach } from './workspace-scope.js';

const RESOURCE = { workspaceId: 'ws-b', userId: 'creator' };

describe('canReach', () => {
  const members = new Set(['ws-a:user', 'ws-b:user', 'ws-a:creator']);
  const workspaces = {
    isMember: (workspaceId: string, userId: string) =>
      Promise.resolve(members.has(`${workspaceId}:${userId}`)),
  };

  it("refuses a resource outside the request's workspace, even to a member of both", async () => {
    await expect(canReach(RESOURCE, 'user', 'ws-a', workspaces)).resolves.toBe(
      false,
    );
  });

  it("allows a member when the request names the resource's workspace", async () => {
    await expect(canReach(RESOURCE, 'user', 'ws-b', workspaces)).resolves.toBe(
      true,
    );
  });

  it('refuses the creator once they are no longer a member of the named workspace', async () => {
    await expect(
      canReach(RESOURCE, 'creator', 'ws-b', workspaces),
    ).resolves.toBe(false);
  });

  it('keeps the creator-or-member rule when the request names no workspace', async () => {
    await expect(
      canReach(RESOURCE, 'creator', undefined, workspaces),
    ).resolves.toBe(true);
    await expect(
      canReach(RESOURCE, 'user', undefined, workspaces),
    ).resolves.toBe(true);
    await expect(
      canReach(RESOURCE, 'stranger', undefined, workspaces),
    ).resolves.toBe(false);
  });
});
