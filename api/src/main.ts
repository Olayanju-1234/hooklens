import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Security headers
  app.use(helmet());

  // nginx on the same host terminates TLS; trust it so req.ip is the real client
  app.set('trust proxy', 'loopback');

  // Limit request body size to 1MB
  app.useBodyParser('json', { limit: '1mb' });
  // Webhooks can arrive as text, XML or anything else; keep them as raw text
  app.useBodyParser('text', { type: '*/*', limit: '1mb' });

  // Don't expose internal paths via Express
  app.disable('x-powered-by');

  // CORS — restrict in production
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-workspace-id'],
  });

  // Strip unknown fields, transform types, block unexpected properties
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix('api', {
    exclude: ['in/:slug', 'in/:slug/:endpointId'],
  });

  // Swagger / OpenAPI docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hookdash API')
    .setDescription('Webhook inspection and debugging platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Hookdash API running on port ${port}`);
}
void bootstrap();
