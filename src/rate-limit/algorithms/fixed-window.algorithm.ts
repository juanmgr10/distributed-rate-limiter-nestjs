import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  RateLimitConfig,
  RateLimitResult,
  RateLimitStorage,
} from '../interfaces';

/**
 * FIXED WINDOW COUNTER
 *
 * Divide el tiempo en ventanas fijas (ej: 1 minuto). Cada ventana tiene un
 * contador atómico en Redis con expiración = duración de la ventana.
 *
 * Clave Redis: {keyPrefix}:{identifier}:{windowTimestamp}
 *
 * Script Lua (atómico):
 *   1. INCR la clave (incremento atómico)
 *   2. Si es el primer request (INCR == 1) → EXPIRE con el TTL de la ventana
 *   3. Comparar el contador contra maxRequests
 *
 * Ventaja:  muy rápido, 2 comandos.
 * Desventaja: permite bursts en el borde de la ventana (un atacante puede
 *             disparar maxRequests justo antes del reset y maxRequests justo
 *             después).
 */
@Injectable()
export class FixedWindowAlgorithm implements RateLimitStorage {
  constructor(private readonly redis: RedisService) {}

  // Nota: en este script los argumentos se pasan como strings desde ioredis.
  private readonly luaScript = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local ttl = tonumber(ARGV[2])

    local count = redis.call('INCR', key)
    if count == 1 then
      redis.call('EXPIRE', key, ttl)
    end

    local allowed = 0
    if count <= limit then
      allowed = 1
    end

    local remaining = limit - count
    if remaining < 0 then
      remaining = 0
    end

    return { allowed, remaining }
  `;

  async checkLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowMs;
    // Ventana fija: el timestamp "cuadrado" en el que cae now
    const windowTimestamp = Math.floor(now / windowMs) * windowMs;

    // Clave única por namespace + identificador + ventana
    const key = `${config.keyPrefix}:${identifier}:${windowTimestamp}`;

    const ttlSeconds = Math.ceil(windowMs / 1000);

    const [allowed, remaining] = (await this.redis.eval(
      this.luaScript,
      1,
      key,
      config.maxRequests,
      ttlSeconds,
    )) as [number, number];

    // Reset = cuando termina la ventana actual
    const resetTime = Math.floor((windowTimestamp + windowMs) / 1000);

    return {
      allowed: allowed === 1,
      remaining,
      resetTime,
      limit: config.maxRequests,
    };
  }

  async getStatus(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowMs;
    const windowTimestamp = Math.floor(now / windowMs) * windowMs;
    const key = `${config.keyPrefix}:${identifier}:${windowTimestamp}`;

    // Lectura sin consumir: GET el contador actual (0 si no existe)
    const count = (await this.redis.get(key)) ?? '0';
    const resetTime = Math.floor((windowTimestamp + windowMs) / 1000);

    return {
      allowed: parseInt(count, 10) <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - parseInt(count, 10)),
      resetTime,
      limit: config.maxRequests,
    };
  }
}
