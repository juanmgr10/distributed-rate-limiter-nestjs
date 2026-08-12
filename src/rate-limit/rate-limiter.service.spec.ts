import { RateLimiterService } from './rate-limiter.service';
import { FixedWindowAlgorithm } from './algorithms/fixed-window.algorithm';
import { SlidingWindowAlgorithm } from './algorithms/sliding-window.algorithm';
import { TokenBucketAlgorithm } from './algorithms/token-bucket.algorithm';
import { Algorithm, RateLimitConfig, RateLimitResult } from './interfaces';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let fixedWindow: jest.Mocked<FixedWindowAlgorithm>;
  let slidingWindow: jest.Mocked<SlidingWindowAlgorithm>;
  let tokenBucket: jest.Mocked<TokenBucketAlgorithm>;

  const config: RateLimitConfig = {
    windowMs: 60_000,
    maxRequests: 10,
    algorithm: Algorithm.FIXED_WINDOW,
    keyPrefix: 'test',
  };

  const result: RateLimitResult = {
    allowed: true,
    remaining: 9,
    resetTime: 1234567890,
    limit: 10,
  };

  beforeEach(() => {
    fixedWindow = {
      checkLimit: jest.fn().mockResolvedValue(result),
      getStatus: jest.fn().mockResolvedValue(result),
    } as unknown as jest.Mocked<FixedWindowAlgorithm>;
    slidingWindow = {
      checkLimit: jest.fn().mockResolvedValue(result),
      getStatus: jest.fn().mockResolvedValue(result),
    } as unknown as jest.Mocked<SlidingWindowAlgorithm>;
    tokenBucket = {
      checkLimit: jest.fn().mockResolvedValue(result),
      getStatus: jest.fn().mockResolvedValue(result),
    } as unknown as jest.Mocked<TokenBucketAlgorithm>;

    service = new RateLimiterService(fixedWindow, slidingWindow, tokenBucket);
  });

  describe('checkLimit', () => {
    it('delega en el algoritmo configurado', async () => {
      const res = await service.checkLimit('client-1', config);
      expect(res).toEqual(result);
      expect(fixedWindow.checkLimit).toHaveBeenCalledWith('client-1', config);
    });

    it('usa SLIDING_WINDOW cuando se configura ese algoritmo', async () => {
      const slidingConfig = { ...config, algorithm: Algorithm.SLIDING_WINDOW };
      await service.checkLimit('client-1', slidingConfig);
      expect(slidingWindow.checkLimit).toHaveBeenCalled();
      expect(fixedWindow.checkLimit).not.toHaveBeenCalled();
    });

    it('usa TOKEN_BUCKET cuando se configura ese algoritmo', async () => {
      const tokenConfig = { ...config, algorithm: Algorithm.TOKEN_BUCKET };
      await service.checkLimit('client-1', tokenConfig);
      expect(tokenBucket.checkLimit).toHaveBeenCalled();
    });

    it('lanza error con algoritmo desconocido', async () => {
      const badConfig = {
        ...config,
        algorithm: 'UNKNOWN' as unknown as Algorithm,
      };
      await expect(service.checkLimit('client-1', badConfig)).rejects.toThrow(
        'Algoritmo no soportado',
      );
    });
  });

  describe('getStatus', () => {
    it('delega en getStatus del algoritmo configurado', async () => {
      const res = await service.getStatus('client-1', config);
      expect(res).toEqual(result);
      expect(fixedWindow.getStatus).toHaveBeenCalledWith('client-1', config);
    });
  });
});
