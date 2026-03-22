import { Controller, Get, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis: Redis;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const redisConfig = this.configService.get('redis') as {
      host: string;
      port: number;
      password?: string;
      tls?: Record<string, never>;
    };
    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Check API and dependency health status' })
  @ApiResponse({ status: 200, description: 'Returns health status of database and Redis' })
  async check() {
    const [dbHealthy, redisHealthy] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const allUp = dbHealthy && redisHealthy;

    return {
      status: allUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'up' : 'down',
        redis: redisHealthy ? 'up' : 'down',
      },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (err) {
      this.logger.error(
        `Database health check failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (err) {
      this.logger.error(
        `Redis health check failed: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
