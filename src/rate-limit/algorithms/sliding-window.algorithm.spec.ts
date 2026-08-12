import { SlidingWindowAlgorithm } from './sliding-window.algorithm';
import { Algorithm, RateLimitConfig } from '../interfaces';
import { RedisService } from '../../redis/redis.service';

describe('SlidingWindowAlgorithm', () => {
  let algorithm: SlidingWindowAlgorithm;
  let mockRedis: { eval: jest.Mock; zcount: jest.Mock };

  const config: RateLimitConfig = {
    windowMs: 10_000,
    maxRequests: 3,
    algorithm: Algorithm.SLIDING_WINDOW,
    keyPrefix: 'test',
  };

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
      zcount: jest.fn(),
    };
    algorithm = new SlidingWindowAlgorithm(
      mockRedis as unknown as RedisService,
    );
  });

  describe('checkLimit', () => {
    it('permite cuando hay menos peticiones que el límite', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('bloquea cuando se supera el límite', async () => {
      mockRedis.eval.mockResolvedValue([0, 0]);

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(false);
    });

    it('usa la clave del log con sufijo :log', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      await algorithm.checkLimit('client-1', config);

      const [_, numKeys, key] = mockRedis.eval.mock.calls[0];
      expect(numKeys).toBe(1);
      expect(key).toBe('test:client-1:log');
    });
  });

  describe('getStatus', () => {
    it('cuenta entradas sin añadir ninguna (ZCOUNT)', async () => {
      mockRedis.zcount.mockResolvedValue(2);

      const result = await algorithm.getStatus('client-1', config);

      expect(result.remaining).toBe(1);
      expect(mockRedis.zcount).toHaveBeenCalledWith(
        'test:client-1:log',
        expect.any(Number),
        '+inf',
      );
    });
  });
});
