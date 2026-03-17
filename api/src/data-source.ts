import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './entities/user.entity.js';
import { Endpoint } from './entities/endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';

const databaseUrl = process.env.DATABASE_URL;
const isProd = process.env.NODE_ENV === 'production';

const base: DataSourceOptions = databaseUrl
  ? {
      type: 'postgres',
      url: databaseUrl,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    }
  : {
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'hookdash',
      password: process.env.DB_PASSWORD ?? 'hookdash_secret',
      database: process.env.DB_NAME ?? 'hookdash',
    };

export const AppDataSource = new DataSource({
  ...base,
  entities: [User, Endpoint, WebhookEvent],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  logging: !isProd,
});
