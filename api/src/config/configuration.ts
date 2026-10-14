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
  const apiUrl = (process.env.API_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
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
      username: process.env.DB_USERNAME || 'hookdash',
      password: process.env.DB_PASSWORD || 'hookdash_secret',
      name: process.env.DB_NAME || 'hookdash',
    },
    redis,
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-jwt-secret',
      expiry: process.env.JWT_EXPIRY || '7d',
    },
    resendApiKey: process.env.RESEND_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'Hookdash <noreply@hookdash.dev>',
    appUrl: (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, ''),
    apiUrl,
    allowPrivateForwarding: process.env.ALLOW_PRIVATE_FORWARDING === 'true',
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl:
        process.env.GOOGLE_CALLBACK_URL || `${apiUrl}/api/auth/google/callback`,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackUrl:
        process.env.GITHUB_CALLBACK_URL || `${apiUrl}/api/auth/github/callback`,
    },
    bags: {
      apiKey: process.env.BAGS_API_KEY || '',
      enabled: process.env.BAGS_RESTREAM_ENABLED === 'true',
    },
  };
};
