import { Module, Global } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { FixedWindowAlgorithm } from './algorithms/fixed-window.algorithm';
import { SlidingWindowAlgorithm } from './algorithms/sliding-window.algorithm';
import { TokenBucketAlgorithm } from './algorithms/token-bucket.algorithm';

/**
 * Módulo de Rate Limiting. Empaqueta el servicio, los algoritmos, el guard
 * y el interceptor.
 *
 * @Global() → sus providers (RateLimiterService, RateLimitGuard, etc.) están
 * disponibles en TODA la app sin necesidad de re-importar este módulo.
 *
 * El guard e interceptor se registran globalmente vía APP_GUARD/APP_INTERCEPTOR
 * en AppModule, por lo que aplican a todos los controllers de la app.
 */
@Global()
@Module({
  providers: [
    FixedWindowAlgorithm,
    SlidingWindowAlgorithm,
    TokenBucketAlgorithm,
    RateLimiterService,
    RateLimitGuard,
    RateLimitInterceptor,
  ],
  exports: [RateLimiterService, RateLimitGuard, RateLimitInterceptor],
})
export class RateLimitModule {}
