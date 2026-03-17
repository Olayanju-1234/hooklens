function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

export default () => {
  const redisUrl = process.env.REDIS_URL;
  const redis = redisUrl
    ? parseRedisUrl(redisUrl)
    : {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: undefined as string | undefined,
        tls: undefined as Record<string, never> | undefined,
      };

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'hooklens',
      password: process.env.DB_PASSWORD || 'hooklens_secret',
      name: process.env.DB_NAME || 'hooklens',
    },
    redis,
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-jwt-secret',
      expiry: process.env.JWT_EXPIRY || '7d',
    },
  };
};
