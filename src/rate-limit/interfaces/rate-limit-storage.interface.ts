import {
  RateLimitConfig,
  RateLimitResult,
} from './rate-limit-config.interface';

/**
 * Contrato que debe cumplir TODO algoritmo de rate limiting.
 *
 * Cada algoritmo (Fixed Window, Sliding Window, Token Bucket) implementa
 * esta interfaz. Así el `RateLimiterService` puede delegar al algoritmo
 * correcto sin saber cuál es.
 *
 * Principio de diseño: Programar contra interfaces, no implementaciones.
 */
export interface RateLimitStorage {
  /**
   * Verifica si una petición debe ser permitida o bloqueada.
   *
   * @param identifier  Identificador único del cliente (IP, API key, etc.)
   * @param config      Configuración del rate limit para esta ruta/cliente
   * @returns           Resultado con allowed/remaining/resetTime/limit
   */
  checkLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult>;

  /**
   * Consulta el estado actual del rate limit para un cliente SIN consumir
   * una petición. Se usa para endpoints de diagnóstico (ej: /rate-limit/status).
   *
   * @param identifier  Identificador único del cliente (IP, API key, etc.)
   * @param config      Configuración del rate limit para esta ruta/cliente
   * @returns           Resultado actual sin modificar el contador
   */
  getStatus(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult>;
}
