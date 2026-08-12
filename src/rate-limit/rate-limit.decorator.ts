import { SetMetadata, applyDecorators } from '@nestjs/common';
import { RateLimitOptions } from './interfaces';

/** Token de metadata usado por el Guard para leer la config del decorador. */
export const RATE_LIMIT_KEY = 'rate_limit';

/** Token de metadata para marcar rutas que NO deben ser limitadas. */
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';

/**
 * Aplica un rate limit a un controller o a un método individual.
 *
 * Uso:
 *   @RateLimit({ windowMs: 60_000, maxRequests: 5 })
 *   @Get('limited')
 *   getLimited() { ... }
 *
 * Si se aplica a la clase, se hereda a todos los métodos (salvo que un método
 * lo sobrescriba con su propio @RateLimit o @SkipRateLimit).
 */
export function RateLimit(options: RateLimitOptions = {}) {
  return applyDecorators(SetMetadata(RATE_LIMIT_KEY, options));
}

/**
 * Excluye un endpoint (o controller completo) del rate limiting.
 *
 * Uso:
 *   @SkipRateLimit()
 *   @Get('public')
 *   getPublic() { ... }
 */
export function SkipRateLimit() {
  return applyDecorators(SetMetadata(SKIP_RATE_LIMIT_KEY, true));
}
