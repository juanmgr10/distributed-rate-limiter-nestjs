import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(host: string, port: number, db: number) {
    super({
      host,
      port,
      db,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.on('connect', () => this.logger.log('Conectado a Redis'));
    this.on('error', (err) => this.logger.error('Error Redis:', err.message));
  }

  async onModuleDestroy() {
    this.logger.log('Cerrando conexión Redis...');
    await this.quit();
  }

  async checkHealth(): Promise<{ status: string; redis: string }> {
    const pong = await this.ping();
    return {
      status: 'ok',
      redis: pong === 'PONG' ? 'OK' : 'ERROR',
    };
  }
}
