import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({})
export class RedisModule {
  static forRootAsync() {
    const redisProvider = {
      provide: RedisService,
      useFactory: (config: ConfigService) => {
        return new RedisService(
          config.get<string>('REDIS_HOST', 'localhost'),
          config.get<number>('REDIS_PORT', 6379),
          config.get<number>('REDIS_DB', 0),
        );
      },
      inject: [ConfigService],
    };

    return {
      module: RedisModule,
      providers: [redisProvider],
      exports: [RedisService],
    };
  }
}
