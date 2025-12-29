import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('CoolifyWorker');

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const rabbitmqUrl = configService.get<string>('RABBITMQ_URL');
  if (!rabbitmqUrl) {
    throw new Error('RABBITMQ_URL is not defined');
  }

  // Connect RabbitMQ microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'coolify_queue',
      queueOptions: { durable: true },
    },
  });

  await app.startAllMicroservices();
  logger.log('Coolify Worker microservice started on coolify_queue');

  // HTTP server for health checks
  const port = configService.get<number>('PORT') || 3116;
  await app.listen(port);
  logger.log(`HTTP server listening on port ${port}`);
}

bootstrap();
