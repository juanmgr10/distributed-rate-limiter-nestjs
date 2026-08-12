import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  RateLimitConfig,
  RateLimitResult,
  RateLimitStorage,
} from '../interfaces';

/**
 * TOKEN BUCKET
 *
 * Modela un "cubo" que se llena de tokens a un ritmo constante (refill rate)
 * y se vacía con cada petición (cada petición consume 1 token). Si el cubo
 * está vacío → se bloquea la petición.
 *
 * Estructura Redis: Hash {tokens, lastRefill}
 * Clave Redis:      {keyPrefix}:{identifier}:bucket
 *
 * Script Lua (atómico):
 *   1. Leer tokens y lastRefill del hash
 *   2. Calcular cuántos tokens se rellenaron desde el último refill
 *      refill = (now - lastRefill) * refillRate
 *   3. tokens = min(maxTokens, tokens + refill)  ← techo del cubo
 *   4. Si tokens >= 1 → tokens -= 1, permitir. Si no → rechazar.
 *   5. Guardar el hash actualizado
 *
 * Ventaja: permite BURSTS controlados (si el cubo está lleno puedes
 *          despacharlos de golpe) y suaviza el tráfico. El más flexible.
 *
 * refillRate = maxRequests / windowMs  (tokens por milisegundo)
 */
@Injectable()
export class TokenBucketAlgorithm implements RateLimitStorage {
  constructor(private readonly redis: RedisService) {}

  private readonly luaScript = `
    local key = KEYS[1]
    local maxTokens = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local nowMs = tonumber(ARGV[4])

    -- 1) Leer estado actual del cubo
    local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local tokens = tonumber(bucket[1])
    local lastRefill = tonumber(bucket[2])

    -- Cubo nuevo → lleno
    if tokens == nil then
      tokens = maxTokens
      lastRefill = nowMs
    end

    -- 2-3) Refill atómico (usamos ms para precisión)
    local elapsed = nowMs - lastRefill
    if elapsed > 0 then
      tokens = math.min(maxTokens, tokens + (elapsed * refillRate))
      lastRefill = nowMs
    end

    -- 4) Consumir token si hay
    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end

    -- 5) Persistir
    redis.call('HSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
    redis.call('EXPIRE', key, math.ceil(maxTokens / refillRate) + 1)

    local remaining = math.floor(tokens)
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
    const key = `${config.keyPrefix}:${identifier}:bucket`;

    // Tokens por milisegundo
    const refillRate = config.maxRequests / config.windowMs;

    // Tiempo hasta llenar el cubo desde vacío = windowMs aprox.
    const [allowed, remaining] = (await this.redis.eval(
      this.luaScript,
      1,
      key,
      config.maxRequests,
      refillRate,
      Math.floor(now / 1000),
      now,
    )) as [number, number];

    // Reset estimado: si está vacío, cuánto falta para 1 token
    const resetTime = Math.floor((now + config.windowMs) / 1000);

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
    const key = `${config.keyPrefix}:${identifier}:bucket`;

    const bucket = await this.redis.hmget(key, 'tokens', 'lastRefill');
    const tokensRaw = bucket[0];
    const lastRefillRaw = bucket[1];

    // Si no existe el cubo, está lleno (maxRequests tokens disponibles)
    if (tokensRaw === null) {
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: Math.floor((now + config.windowMs) / 1000),
        limit: config.maxRequests,
      };
    }

    // Calcular refill que habría ocurrido hasta ahora (sin escribir)
    const tokens = parseFloat(tokensRaw);
    const lastRefill = parseInt(lastRefillRaw ?? String(now), 10);
    const refillRate = config.maxRequests / config.windowMs;
    const elapsed = now - lastRefill;
    const currentTokens = Math.min(
      config.maxRequests,
      tokens + elapsed * refillRate,
    );

    return {
      allowed: currentTokens >= 1,
      remaining: Math.floor(Math.max(0, currentTokens)),
      resetTime: Math.floor((now + config.windowMs) / 1000),
      limit: config.maxRequests,
    };
  }
}
