import { IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunScenarioDto {
  @ApiProperty({ description: 'The route (endpoint) to run the scenario on' })
  @IsUUID()
  endpointId!: string;

  @ApiProperty({
    example: 'fallback',
    description: 'A destination id, or `fallback` for the route forward URL',
  })
  @IsString()
  @Matches(/^(fallback|[0-9a-f-]{36})$/i, {
    message: 'target must be a destination id or "fallback"',
  })
  target!: string;
}
