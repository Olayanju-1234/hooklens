import Joi from 'joi';

export const envValidationSchema = Joi.object({
  // ── App ────────────────────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
  APP_URL: Joi.string().uri().default('http://localhost:3001'),
  API_URL: Joi.string().uri().default('http://localhost:3000'),
  ALLOW_PRIVATE_FORWARDING: Joi.boolean().default(false),

  // ── Database (either DATABASE_URL or individual fields) ────────────
  DATABASE_URL: Joi.string().uri().optional(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('hookdash'),
  DB_PASSWORD: Joi.string().default('hookdash_secret'),
  DB_NAME: Joi.string().default('hookdash'),

  // ── Redis (either REDIS_URL or individual fields) ──────────────────
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // ── JWT (required in production) ───────────────────────────────────
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required().messages({
      'string.min': 'JWT_SECRET must be at least 32 characters in production',
      'any.required': 'JWT_SECRET is required in production',
    }),
    otherwise: Joi.string().default('dev-jwt-secret'),
  }),
  JWT_EXPIRY: Joi.string().default('7d'),

  // ── Email ──────────────────────────────────────────────────────────
  RESEND_API_KEY: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().default('Hookdash <noreply@hookdash.dev>'),

  // ── OAuth (optional — app works without them) ──────────────────────
  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_CALLBACK_URL: Joi.string().allow('').default(''),
  GITHUB_CLIENT_ID: Joi.string().allow('').default(''),
  GITHUB_CLIENT_SECRET: Joi.string().allow('').default(''),
  GITHUB_CALLBACK_URL: Joi.string().allow('').default(''),
}).options({ allowUnknown: true });
