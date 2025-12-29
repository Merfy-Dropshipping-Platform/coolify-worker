import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { CoolifyModule } from './coolify/coolify.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CoolifyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
