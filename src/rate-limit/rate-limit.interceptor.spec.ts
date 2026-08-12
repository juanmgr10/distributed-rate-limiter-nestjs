import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitResult } from './interfaces';

describe('RateLimitInterceptor', () => {
  let interceptor: RateLimitInterceptor;
  let mockResponse: { setHeader: jest.Mock };

  const result: RateLimitResult = {
    allowed: true,
    remaining: 4,
    resetTime: 1786558500,
    limit: 5,
  };

  const mockContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => mockResponse,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    interceptor = new RateLimitInterceptor();
    mockResponse = { setHeader: jest.fn() };
  });

  it('añade headers X-RateLimit-* cuando hay rateLimitResult', async () => {
    const request = { rateLimitResult: result };

    await lastValueFrom(
      interceptor.intercept(mockContext(request), {
        handle: () => of('respuesta'),
      }),
    );

    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      '5',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      '4',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Reset',
      '1786558500',
    );
  });

  it('no añade headers si no hay rateLimitResult', async () => {
    const request = {}; // sin rateLimitResult

    await lastValueFrom(
      interceptor.intercept(mockContext(request), {
        handle: () => of('respuesta'),
      }),
    );

    expect(mockResponse.setHeader).not.toHaveBeenCalled();
  });
});
