import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimitResult } from './interfaces';
import { SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let rateLimiter: jest.Mocked<RateLimiterService>;
  let mockRequest: any;
  let mockResponse: { setHeader: jest.Mock };

  const allowed: RateLimitResult = {
    allowed: true,
    remaining: 4,
    resetTime: Math.floor(Date.now() / 1000) + 60,
    limit: 5,
  };

  const blocked: RateLimitResult = {
    allowed: false,
    remaining: 0,
    resetTime: Math.floor(Date.now() / 1000) + 30,
    limit: 5,
  };

  const mockContext = (): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockRequest = { ip: '127.0.0.1', headers: {} };
    mockResponse = { setHeader: jest.fn() };
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    rateLimiter = {
      checkLimit: jest.fn(),
      getStatus: jest.fn(),
    } as unknown as jest.Mocked<RateLimiterService>;
    guard = new RateLimitGuard(reflector, rateLimiter);
  });

  describe('canActivate', () => {
    it('permite si la ruta está marcada con @SkipRateLimit', async () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === SKIP_RATE_LIMIT_KEY) return true;
        return undefined;
      });

      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
      expect(rateLimiter.checkLimit).not.toHaveBeenCalled();
    });

    it('aplica el default global si no hay @RateLimit en la ruta', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      rateLimiter.checkLimit.mockResolvedValue(allowed);

      const result = await guard.canActivate(mockContext());
      expect(result).toBe(true);
      expect(rateLimiter.checkLimit).toHaveBeenCalled();
      // Identificador IP
      const identifier = rateLimiter.checkLimit.mock.calls[0][0];
      expect(identifier).toBe('ip:127.0.0.1');
    });

    it('guarda el resultado en el request si es permitido', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      rateLimiter.checkLimit.mockResolvedValue(allowed);

      await guard.canActivate(mockContext());
      expect(mockRequest.rateLimitResult).toEqual(allowed);
    });

    it('lanza HttpException 429 si está bloqueado', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      rateLimiter.checkLimit.mockResolvedValue(blocked);

      await expect(guard.canActivate(mockContext())).rejects.toThrow(
        HttpException,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String),
      );
    });
  });

  describe('resolveIdentifier (estático)', () => {
    it('prioriza el header X-API-Key', () => {
      const req = { headers: { 'x-api-key': 'abc' }, ip: '127.0.0.1' };
      expect(RateLimitGuard.resolveIdentifier(req)).toBe('apikey:abc');
    });

    it('usa x-forwarded-for si existe (primer IP)', () => {
      const req = {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
        ip: '127.0.0.1',
      };
      expect(RateLimitGuard.resolveIdentifier(req)).toBe('ip:10.0.0.1');
    });

    it('usa req.ip como último recurso', () => {
      const req = { headers: {}, ip: '192.168.1.10' };
      expect(RateLimitGuard.resolveIdentifier(req)).toBe('ip:192.168.1.10');
    });
  });
});
