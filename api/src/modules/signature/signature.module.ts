import { Module } from '@nestjs/common';
import { SignatureService } from './signature.service.js';

@Module({
  providers: [SignatureService],
  exports: [SignatureService],
})
export class SignatureModule {}
