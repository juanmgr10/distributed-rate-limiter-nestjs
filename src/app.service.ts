import { Injectable } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(private readonly redis: RedisService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async healthCheck() {
    return this.redis.checkHealth();
  }
}
