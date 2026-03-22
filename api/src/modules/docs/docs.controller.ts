import { Controller, Get, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { DocsService } from './docs.service.js';

@ApiTags('Docs')
@Controller('docs')
@SkipThrottle()
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List all supported webhook providers' })
  @ApiResponse({ status: 200, description: 'Returns list of supported providers' })
  getProviders() {
    return this.docsService.getProviders();
  }

  @Get('providers/:provider')
  @ApiOperation({ summary: 'Get details for a specific provider' })
  @ApiResponse({ status: 200, description: 'Returns provider details' })
  @ApiParam({ name: 'provider', type: String })
  getProvider(@Param('provider') provider: string) {
    return this.docsService.getProvider(provider);
  }

  @Get('providers/:provider/events/:eventType')
  @ApiOperation({ summary: 'Get documentation for a specific event type' })
  @ApiResponse({ status: 200, description: 'Returns event type documentation' })
  @ApiParam({ name: 'provider', type: String })
  @ApiParam({ name: 'eventType', type: String })
  getEventDoc(
    @Param('provider') provider: string,
    @Param('eventType') eventType: string,
  ) {
    return this.docsService.getEventDoc(provider, eventType);
  }
}
