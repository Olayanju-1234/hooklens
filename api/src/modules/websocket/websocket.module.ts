import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity.js';
import { WebhookGateway } from './webhook.gateway.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ApiKeysModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [WebhookGateway],
  exports: [WebhookGateway],
})
export class WebsocketModule {}
