import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { JwtStrategy } from './jwt.strategy.js';
import type { User } from '../../../entities/user.entity.js';

describe('JwtStrategy', () => {
  const userRepo = { findOne: jest.fn() };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      userRepo as unknown as Repository<User>,
    );
  });

  it('accepts a token whose version matches the user', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', tokenVersion: 3 });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com', ver: 3 }),
    ).resolves.toEqual({ sub: 'u1', email: 'a@example.com' });
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { id: true, tokenVersion: true },
    });
  });

  it('accepts a pre-tokenVersion token while the user is still on version 0', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', tokenVersion: 0 });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com' }),
    ).resolves.toEqual({ sub: 'u1', email: 'a@example.com' });
  });

  it('rejects a token issued before a password reset or change', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', tokenVersion: 4 });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com', ver: 3 }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a pre-tokenVersion token once the version has been bumped', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', tokenVersion: 1 });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for a user that no longer exists', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'gone', email: 'a@example.com', ver: 0 }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
