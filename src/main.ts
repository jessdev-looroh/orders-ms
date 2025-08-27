import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { Logger } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const logger = new Logger('Orders-MS-Main');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,
      options: {
        port: envs.port,
      },
    },
  );
  await app.listen();
  logger.log(`Microservice is running on port ${envs.port}`);
}
void bootstrap();
