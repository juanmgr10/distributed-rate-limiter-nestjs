import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  RateLimitConfig,
  RateLimitResult,
  RateLimitStorage,
} from '../interfaces';

/**
 * SLIDING WINDOW LOG
 *
 * En lugar de ventanas fijas, registra el timestamp de CADA petición en un
 * Sorted Set de Redis. La ventana "desliza": solo cuenta las peticiones cuyo
 * timestamp está dentro de [now - windowMs, now].
 *
 * Clave Redis: {keyPrefix}:{identifier}:log
 *
 * Script Lua (atómico):
 *   1. ZREMRANGEBYSCORE — elimina las entradas fuera de la ventana actual
 *   2. ZADD — registra la petición actual con su timestamp como score
 *   3. ZCOUNT/ZCARD — cuenta las peticiones dentro de la ventana
 *   4. EXPIRE — TTL en el set para no dejar basura en Redis
 *
 * Ventaja:  precisión exacta — no hay bursts en los bordes.
 * Desventaja: consume más memoria (una entrada por petición) y es más lento.
 */
@Injectable()
export class SlidingWindowAlgorithm implements RateLimitStorage {
  constructor(private readonly redis: RedisService) {}

  private readonly luaScript = `
    local key = KEYS[1]
    local member = ARGV[1]
    local now = tonumber(ARGV[2])
    local windowMs = tonumber(ARGV[3])
    local limit = tonumber(ARGV[4])

    -- 1) Borrar entradas que ya salieron de la ventana (score <= now - windowMs)
    local minScore = now - windowMs
    redis.call('ZREMRANGEBYSCORE', key, 0, minScore)

    -- 2) Registrar la peticion actual
    redis.call('ZADD', key, now, member)

    -- 3) Contar cuantas peticiones hay en la ventana
    local count = redis.call('ZCARD', key)

    -- 4) TTL: un poco mas largo que la ventana
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)

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
    const key = `${config.keyPrefix}:${identifier}:log`;

    // Miembro único por petición (para no colisionar en el Sorted Set)
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    const [allowed, remaining] = (await this.redis.eval(
      this.luaScript,
      1,
      key,
      member,
      now,
      config.windowMs,
      config.maxRequests,
    )) as [number, number];

    // Reset = la entrada más antigua sale de la ventana en ≤ windowMs
    const resetTime = Math.floor((now + config.windowMs) / 1000);

    return {
      allowed: allowed === 1,
      remaining,
      resetTime,
      limit: config.maxRequests,
    };
  }
}
