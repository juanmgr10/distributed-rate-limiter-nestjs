/**
 * Algoritmos de rate limiting disponibles.
 *
 * - FIXED_WINDOW:  Contador simple con TTL en Redis (rápido, pero permite
 *                   bursts en el borde de la ventana).
 * - SLIDING_WINDOW: Usa Sorted Sets para precisión exacta en la ventana
 *                   deslizante (más preciso, más memoria).
 * - TOKEN_BUCKET:   Permite bursts controlados rellenando tokens a ritmo
 *                   constante (el más flexible).
 */
export enum Algorithm {
  FIXED_WINDOW = 'FIXED_WINDOW',
  SLIDING_WINDOW = 'SLIDING_WINDOW',
  TOKEN_BUCKET = 'TOKEN_BUCKET',
}

/**
 * Configuración completa de un rate limit.
 * `keyPrefix` se usa para namespaces en las claves de Redis
 * (ej: "ratelimit:global" vs "ratelimit:auth").
 */
export interface RateLimitConfig {
  /** Ventana de tiempo en milisegundos (ej: 60000 = 1 minuto) */
  windowMs: number;

  /** Máximo de peticiones permitidas en esa ventana */
  maxRequests: number;

  /** Algoritmo a usar para el conteo */
  algorithm: Algorithm;

  /** Prefijo para las claves en Redis (namespaces) */
  keyPrefix: string;
}

/**
 * Versión parcial de RateLimitConfig para que el decorador `@RateLimit()`
 * acepte solo los campos que el desarrollador quiera sobrescribir.
 */
export type RateLimitOptions = Partial<RateLimitConfig>;

/**
 * Resultado de una verificación de rate limit.
 * Se usa tanto para la respuesta HTTP (headers) como para la lógica interna.
 */
export interface RateLimitResult {
  /** true = petición permitida, false = bloqueada (429) */
  allowed: boolean;

  /** Cuántas peticiones le quedan al cliente en esta ventana */
  remaining: number;

  /** Timestamp Unix (segundos) en que se resetea la ventana */
  resetTime: number;

  /** El límite máximo configurado (para los headers X-RateLimit-Limit) */
  limit: number;
}
