import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration.js';
import { User } from './entities/user.entity.js';
import { Endpoint } from './entities/endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EndpointsModule } from './modules/endpoints/endpoints.module.js';
import { IngressModule } from './modules/ingress/ingress.module.js';
import { ForwardModule } from './modules/forward/forward.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { WebsocketModule } from './modules/websocket/websocket.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Global rate limiting: 60 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('databaseUrl');
        const isProd = configService.get<string>('nodeEnv') === 'production';
        const base = databaseUrl
          ? {
              type: 'postgres' as const,
              url: databaseUrl,
              ssl: isProd ? { rejectUnauthorized: false } : false,
            }
          : {
              type: 'postgres' as const,
              host: configService.get<string>('database.host'),
              port: configService.get<number>('database.port'),
              username: configService.get<string>('database.username'),
              password: configService.get<string>('database.password'),
              database: configService.get<string>('database.name'),
            };
        return {
          ...base,
          entities: [User, Endpoint, WebhookEvent],
          synchronize: !isProd,
          logging: !isProd,
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          tls: configService.get('redis.tls'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    AuthModule,
    EndpointsModule,
    IngressModule,
    ForwardModule,
    EventsModule,
    StatsModule,
    WebsocketModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
