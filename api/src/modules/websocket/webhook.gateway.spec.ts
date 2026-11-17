import type { Socket } from 'socket.io';
import { WebhookGateway, liveRoom } from './webhook.gateway.js';

const USER = 'user-1';
const WS_A = 'ws-a';
const WS_B = 'ws-b';

describe('WebhookGateway workspace rooms', () => {
  const apiKeys = { validateKey: jest.fn() };
  const workspaces = { isMember: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const jwt = { verify: jest.fn() };
  let gateway: WebhookGateway;

  const client = (auth: Record<string, unknown>) =>
    ({
      id: 'sock-1',
      handshake: { auth, headers: {} },
      join: jest.fn(),
      disconnect: jest.fn(),
    }) as unknown as Socket & { join: jest.Mock; disconnect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    workspaces.isMember.mockImplementation((ws: string) =>
      Promise.resolve(ws === WS_A || ws === WS_B),
    );
    userRepo.findOne.mockResolvedValue({ id: USER, tokenVersion: 0 });
    jwt.verify.mockReturnValue({ sub: USER, email: 'u@example.test' });
    gateway = new WebhookGateway(
      jwt as never,
      userRepo as never,
      apiKeys as never,
      workspaces as never,
    );
  });

  it("puts an API key in its creator's room for the key's workspace only", async () => {
    apiKeys.validateKey.mockResolvedValue({
      createdByUserId: USER,
      workspaceId: WS_A,
    });
    const socket = client({ apiKey: 'hd_key' });
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith(`user:${USER}:workspace:${WS_A}`);
    expect(socket.join).not.toHaveBeenCalledWith(`user:${USER}`);
  });

  it('turns away an API key whose creator left its workspace', async () => {
    apiKeys.validateKey.mockResolvedValue({
      createdByUserId: USER,
      workspaceId: 'ws-gone',
    });
    const socket = client({ apiKey: 'hd_key' });
    await gateway.handleConnection(socket);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('keeps a session without a workspace in the user room', async () => {
    const socket = client({ token: 'jwt' });
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith(`user:${USER}`);
  });

  it('pins a session that names a workspace it belongs to', async () => {
    const socket = client({ token: 'jwt', workspaceId: WS_B });
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith(`user:${USER}:workspace:${WS_B}`);
  });

  it('turns away a session naming a workspace it is not in', async () => {
    const socket = client({ token: 'jwt', workspaceId: 'ws-other' });
    await gateway.handleConnection(socket);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it("sends an event to the creator's user room and that workspace's room, never another workspace's", () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as never;
    const payload = {
      eventId: 'evt-1',
      forwardStatus: 'forwarded',
      forwardCode: 200,
      forwardLatency: 5,
    };

    gateway.broadcastForwardResult(USER, WS_B, payload);

    expect(to).toHaveBeenCalledWith([
      liveRoom(USER, null),
      liveRoom(USER, WS_B),
    ]);
    expect(to).not.toHaveBeenCalledWith(
      expect.arrayContaining([liveRoom(USER, WS_A)]),
    );
    expect(emit).toHaveBeenCalledWith('forward_result', payload);
  });
});
