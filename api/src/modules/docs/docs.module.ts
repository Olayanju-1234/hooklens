import { Module } from '@nestjs/common';
import { DocsService } from './docs.service.js';
import { DocsController } from './docs.controller.js';

@Module({
  controllers: [DocsController],
  providers: [DocsService],
})
export class DocsModule {}
