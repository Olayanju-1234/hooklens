import { Controller, Get, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async check() {
    const dbHealthy = await this.checkDatabase();
    const status = dbHealthy ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'up' : 'down',
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
}
