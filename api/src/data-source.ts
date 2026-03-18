import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from './entities/user.entity.js';
import { Endpoint } from './entities/endpoint.entity.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';
import { Workspace } from './entities/workspace.entity.js';
import { WorkspaceMember } from './entities/workspace-member.entity.js';
import { WorkspaceInvite } from './entities/workspace-invite.entity.js';
import { ForwardDestination } from './entities/forward-destination.entity.js';
import { ForwardResult } from './entities/forward-result.entity.js';
import { DeadLetterEvent } from './entities/dead-letter-event.entity.js';
import { TransformRule } from './entities/transform-rule.entity.js';
import { AlertChannel } from './entities/alert-channel.entity.js';
import { AlertRule } from './entities/alert-rule.entity.js';
import { AlertHistory } from './entities/alert-history.entity.js';

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
  entities: [
    User,
    Endpoint,
    WebhookEvent,
    Workspace,
    WorkspaceMember,
    WorkspaceInvite,
    ForwardDestination,
    ForwardResult,
    DeadLetterEvent,
    TransformRule,
    AlertChannel,
    AlertRule,
    AlertHistory,
  ],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  logging: !isProd,
});
