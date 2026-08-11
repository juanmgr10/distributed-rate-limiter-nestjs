import { Injectable } from '@nestjs/common';
import { Algorithm, RateLimitConfig, RateLimitResult } from './interfaces';
import { RateLimitStorage } from './interfaces/rate-limit-storage.interface';
import { FixedWindowAlgorithm } from './algorithms/fixed-window.algorithm';
import { SlidingWindowAlgorithm } from './algorithms/sliding-window.algorithm';
import { TokenBucketAlgorithm } from './algorithms/token-bucket.algorithm';

/**
 * Orquesta la verificación de rate limiting delegando en el algoritmo
 * configurado. El resto de la app solo habla con este servicio, nunca con
 * los algoritmos directamente.
 */
@Injectable()
export class RateLimiterService {
  private readonly algorithms: Record<Algorithm, RateLimitStorage>;

  constructor(
    fixedWindow: FixedWindowAlgorithm,
    slidingWindow: SlidingWindowAlgorithm,
    tokenBucket: TokenBucketAlgorithm,
  ) {
    this.algorithms = {
      [Algorithm.FIXED_WINDOW]: fixedWindow,
      [Algorithm.SLIDING_WINDOW]: slidingWindow,
      [Algorithm.TOKEN_BUCKET]: tokenBucket,
    };
  }

  /**
   * Verifica si una petición debe ser permitida o bloqueada.
   *
   * @param identifier  IP, API key u otro identificador del cliente
   * @param config      Configuración del rate limit (con algoritmo)
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const algorithm = this.algorithms[config.algorithm];
    if (!algorithm) {
      throw new Error(`Algoritmo no soportado: ${config.algorithm}`);
    }
    return algorithm.checkLimit(identifier, config);
  }
}
