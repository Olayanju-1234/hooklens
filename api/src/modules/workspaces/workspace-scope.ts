import type { WorkspacesService } from './workspaces.service.js';

export interface WorkspaceScoped {
  workspaceId: string;
  userId: string;
}

/**
 * With a request workspace (API keys always have theirs), the resource must sit in it and the user be a member;
 * without one, the resource's creator or any member of its workspace can reach it.
 */
export async function canReach(
  resource: WorkspaceScoped,
  userId: string,
  workspaceId: string | undefined,
  workspaces: Pick<WorkspacesService, 'isMember'>,
): Promise<boolean> {
  if (workspaceId) {
    return (
      resource.workspaceId === workspaceId &&
      workspaces.isMember(workspaceId, userId)
    );
  }
  return (
    resource.userId === userId ||
    workspaces.isMember(resource.workspaceId, userId)
  );
}
