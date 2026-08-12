import { TokenBucketAlgorithm } from './token-bucket.algorithm';
import { Algorithm, RateLimitConfig } from '../interfaces';
import { RedisService } from '../../redis/redis.service';

describe('TokenBucketAlgorithm', () => {
  let algorithm: TokenBucketAlgorithm;
  let mockRedis: { eval: jest.Mock; hmget: jest.Mock };

  const config: RateLimitConfig = {
    windowMs: 10_000,
    maxRequests: 3,
    algorithm: Algorithm.TOKEN_BUCKET,
    keyPrefix: 'test',
  };

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
      hmget: jest.fn(),
    };
    algorithm = new TokenBucketAlgorithm(mockRedis as unknown as RedisService);
  });

  describe('checkLimit', () => {
    it('permite cuando hay tokens disponibles', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('bloquea cuando el cubo está vacío', async () => {
      mockRedis.eval.mockResolvedValue([0, 0]);

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('usa la clave del cubo con sufijo :bucket', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      await algorithm.checkLimit('client-1', config);

      const [_, numKeys, key] = mockRedis.eval.mock.calls[0];
      expect(numKeys).toBe(1);
      expect(key).toBe('test:client-1:bucket');
    });

    it('pasa la tasa de refill calculada (tokens/ms)', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      await algorithm.checkLimit('client-1', config);

      const args = mockRedis.eval.mock.calls[0];
      expect(args[3]).toBe(3); // maxTokens
      expect(args[4]).toBeCloseTo(3 / 10_000); // refillRate
    });
  });

  describe('getStatus', () => {
    it('devuelve cubo lleno si no existe el hash', async () => {
      mockRedis.hmget.mockResolvedValue([null, null]);

      const result = await algorithm.getStatus('client-1', config);

      expect(result.remaining).toBe(3);
      expect(result.allowed).toBe(true);
    });

    it('calcula refill acumulado sin escribir', async () => {
      const now = Date.now();
      // 2 tokens hace 5000ms (mitad de ventana) → refill ~1.5 → ~3.5 → min(3, 3.5)=3
      mockRedis.hmget.mockResolvedValue([String(2), String(now - 5000)]);

      const result = await algorithm.getStatus('client-1', config);

      expect(result.remaining).toBeGreaterThanOrEqual(2);
      expect(result.allowed).toBe(true);
      expect(mockRedis.hmget).toHaveBeenCalledWith(
        'test:client-1:bucket',
        'tokens',
        'lastRefill',
      );
    });
  });
});
