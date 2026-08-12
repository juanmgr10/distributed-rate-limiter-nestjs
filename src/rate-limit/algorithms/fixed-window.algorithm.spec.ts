import { FixedWindowAlgorithm } from './fixed-window.algorithm';
import { Algorithm, RateLimitConfig } from '../interfaces';
import { RedisService } from '../../redis/redis.service';

describe('FixedWindowAlgorithm', () => {
  let algorithm: FixedWindowAlgorithm;
  let mockRedis: { eval: jest.Mock; get: jest.Mock };

  const config: RateLimitConfig = {
    windowMs: 10_000,
    maxRequests: 3,
    algorithm: Algorithm.FIXED_WINDOW,
    keyPrefix: 'test',
  };

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
      get: jest.fn(),
    };
    algorithm = new FixedWindowAlgorithm(mockRedis as unknown as RedisService);
  });

  describe('checkLimit', () => {
    it('permite si el contador no excede el límite', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]); // allowed, remaining

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.limit).toBe(3);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('bloquea si el contador excede el límite', async () => {
      mockRedis.eval.mockResolvedValue([0, 0]); // bloqueado, remaining 0

      const result = await algorithm.checkLimit('client-1', config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('la clave usa el prefijo, identificador y timestamp de ventana', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      await algorithm.checkLimit('client-1', config);

      const [script, numKeys, key] = mockRedis.eval.mock.calls[0];
      expect(numKeys).toBe(1);
      // test:client-1:windowTimestamp
      expect(key).toMatch(/^test:client-1:\d+$/);
    });

    it('pasa el TTL de la ventana al script', async () => {
      mockRedis.eval.mockResolvedValue([1, 2]);

      await algorithm.checkLimit('client-1', config);

      const args = mockRedis.eval.mock.calls[0];
      expect(args[3]).toBe(3); // maxRequests
      expect(args[4]).toBe(10); // ttl segundos = windowMs/1000
    });
  });

  describe('getStatus', () => {
    it('devuelve remaining correcto sin consumir (GET)', async () => {
      mockRedis.get.mockResolvedValue('1'); // ya hubo 1 petición

      const result = await algorithm.getStatus('client-1', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('devuelve remaining = límite si no hay contador (null)', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await algorithm.getStatus('client-1', config);

      expect(result.remaining).toBe(3);
    });
  });
});
