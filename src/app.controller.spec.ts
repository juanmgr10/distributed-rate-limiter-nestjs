import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { RateLimiterService } from './rate-limit/rate-limiter.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockRedisService = {
      ping: jest.fn().mockResolvedValue('PONG'),
      checkHealth: jest.fn().mockResolvedValue({ status: 'ok', redis: 'OK' }),
    };

    const mockRateLimiterService = {
      checkLimit: jest.fn(),
      getStatus: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: RateLimiterService, useValue: mockRateLimiterService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
