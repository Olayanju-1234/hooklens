import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { JwtPayload } from '../../../common/decorators/current-user.decorator.js';
import { User } from '../../../entities/user.entity.js';

// Tokens minted before tokenVersion existed carry no claim and match the initial version 0
export function isTokenCurrent(
  payload: JwtPayload,
  user: Pick<User, 'tokenVersion'> | null,
): boolean {
  return !!user && user.tokenVersion === (payload.ver ?? 0);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const secret = configService.getOrThrow<string>('jwt.secret');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: { id: true, tokenVersion: true },
    });
    if (!isTokenCurrent(payload, user)) {
      throw new UnauthorizedException('Session has been revoked');
    }
    return { sub: payload.sub, email: payload.email };
  }
}
