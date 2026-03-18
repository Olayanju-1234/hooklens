import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity.js';
import { TestPayloadsService } from './test-payloads.service.js';
import { TestPayloadsController } from './test-payloads.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TestPayloadsController],
  providers: [TestPayloadsService],
})
export class TestPayloadsModule {}
