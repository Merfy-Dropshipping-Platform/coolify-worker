import { Module } from '@nestjs/common';
import { CoolifyService } from './coolify.service';
import { CoolifyController } from './coolify.controller';

@Module({
  controllers: [CoolifyController],
  providers: [CoolifyService],
  exports: [CoolifyService],
})
export class CoolifyModule {}
