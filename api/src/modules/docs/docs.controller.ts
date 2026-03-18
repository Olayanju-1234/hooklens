import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DocsService } from './docs.service.js';

@Controller('docs')
@SkipThrottle()
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Get('providers')
  getProviders() {
    return this.docsService.getProviders();
  }

  @Get('providers/:provider')
  getProvider(@Param('provider') provider: string) {
    return this.docsService.getProvider(provider);
  }

  @Get('providers/:provider/events/:eventType')
  getEventDoc(
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
  ) {
    return this.docsService.getEventDoc(provider, eventType);
  }
}
