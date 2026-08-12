# 🔒 Sistema de Rate Limiting Distribuido — NestJS + Redis

Sistema de **rate limiting distribuido** construido desde cero con **NestJS** y **Redis** como backend de estado compartido. Protege la API contra abusos, *scraping* masivo y ataques de denegación de servicio limitando el tráfico **antes** de que golpee la base de datos.

## ✨ Características

- 🧠 **3 algoritmos de rate limiting** implementados desde cero sobre Redis:
  - **Fixed Window** — contador atómico con TTL (`INCR` + `EXPIRE`)
  - **Sliding Window Log** — precisión exacta con Sorted Sets (`ZREMRANGEBYSCORE` + `ZADD` + `ZCARD`)
  - **Token Bucket** — bursts controlados con Hash y refill atómico
- 🗂️ **Distribuido**: el estado vive en Redis (fuente de verdad única), no en la memoria de la app → **escala horizontal** a múltiples instancias sin romper los límites.
- ⚡ **Atomicidad real** con **scripts Lua** (`EVAL`) — cero race conditions bajo concurrencia.
- 🎯 **Identificación flexible**: por IP, por `X-Forwarded-For`, o por API key (`X-API-Key`).
- 📋 **Headers HTTP estándar**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
- 🛡️ **Guard + Interceptor** globales: el Guard decide, el Interceptor informa.
- 🧪 **31 tests unitarios** (mockeando Redis) + **7 tests e2e** con Redis real.

## 🏗️ Arquitectura

```
                  Internet
                     │
        ┌────────────▼────────────┐
        │   NestJS App (RateLimitGuard)   │  ← APP_GUARD global
        └────────────┬────────────┘
                     │  checkLimit(identifier, config)
                     ▼
        ┌──────────────────────┐
        │   RateLimiterService  │  ← orquesta por config.algorithm
        └──────────┬───────────┘
        ┌──────────┼──────────┬─────────────┐
        ▼          ▼          ▼             ▼
┌────────────┐ ┌─────────┐ ┌───────────┐ ┌────────────┐
│ FixedWindow │ │ Sliding │ │ TokenBucket │ │ (nuevos)   │
│   INCR+TTL  │ │ SortedSet│ │  Hash+Lua   │ │            │
└────────────┘ └─────────┘ └───────────┘ └────────────┘
        └──────────────┬────────────────────┘
                       ▼
        ┌──────────────────────────────┐
        │          REDIS (7)           │  ← estado compartido entre instancias
        │   (Docker: puerto 6380)      │
        └──────────────────────────────┘
                       │
        ┌──────────────▼─────────────────────────┐
        │   Base de datos principal (protegida)   │  ← nunca recibe tráfico excesivo
        └────────────────────────────────────────┘
```

## 📦 Estructura del proyecto

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # ConfigModule + RedisModule + RateLimitModule
├── app.controller.ts                # Endpoints de demostración
├── app.service.ts
├── redis/
│   ├── redis.module.ts              # @Global(), forRootAsync() lee el .env
│   └── redis.service.ts             # Extiende ioredis.Redis, cierre graceful
└── rate-limit/
    ├── rate-limit.module.ts         # @Global(), registra guard/interceptor/servicio
    ├── rate-limit.guard.ts          # APP_GUARD: decide allow/deny
    ├── rate-limit.interceptor.ts    # APP_INTERCEPTOR: headers X-RateLimit-*
    ├── rate-limit.decorator.ts      # @RateLimit() y @SkipRateLimit()
    ├── rate-limiter.service.ts      # Orquesta los algoritmos
    ├── algorithms/
    │   ├── fixed-window.algorithm.ts
    │   ├── sliding-window.algorithm.ts
    │   └── token-bucket.algorithm.ts
    └── interfaces/
        ├── rate-limit-config.interface.ts
        └── rate-limit-storage.interface.ts
```

## 🚀 Puesta en marcha

### Requisitos
- Node.js 20+ y npm
- Docker + Docker Compose

### 1. Levantar Redis

```bash
docker compose up -d
```

> El contenedor expone Redis en el puerto **6380** del host (el 6379 puede estar ocupado por un `redis-server` nativo del sistema). Dentro del contenedor Redis sigue en 6379.

### 2. Configurar el entorno

Copia el archivo `.env.example` a `.env` si no existe (las variables vienen con valores por defecto razonables).

### 3. Instalar y arrancar

```bash
npm install
npm run start:dev
```

La app arranca en `http://localhost:3000`.

## 🧪 Probar el rate limiting

```bash
# Endpoint con Fixed Window (max 5/min) — las 5 primeras OK, la 6ª → 429
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "req#$i: HTTP %{http_code}\n" http://localhost:3000/limited/fixed
done

# Ver los headers X-RateLimit-*
curl -sI http://localhost:3000/limited/fixed

# Rate limit por API key (contadores independientes por clave)
curl -s -H "X-API-Key: mi-clave-1" http://localhost:3000/limited/api-key

# Estado actual del caller sin consumir peticiones
curl -s http://localhost:3000/rate-limit/status
```

### Endpoints de demostración

| Endpoint | Rate limit | Identificador |
|---|---|---|
| `/` | Default (100/min) | IP |
| `/health/redis` | Default (100/min) | IP |
| `/public` | Ninguno (`@SkipRateLimit`) | — |
| `/limited/fixed` | 5/min — Fixed Window | IP |
| `/limited/sliding` | 10/min — Sliding Window | IP |
| `/limited/token` | 3/min — Token Bucket | IP |
| `/limited/api-key` | 5/min — Fixed Window | `X-API-Key` |
| `/rate-limit/status` | Ninguno (solo lectura) | IP o `X-API-Key` |

## 🧠 Cómo usar el decorador

```typescript
import { RateLimit, SkipRateLimit } from './rate-limit/rate-limit.decorator';
import { Algorithm } from './rate-limit/interfaces';

@Controller('mi-api')
export class MiController {
  // Límite específico con algoritmo
  @RateLimit({ windowMs: 60_000, maxRequests: 20, algorithm: Algorithm.TOKEN_BUCKET })
  @Get('recurso')
  getRecurso() { /* ... */ }

  // Sin límite (público)
  @SkipRateLimit()
  @Get('health')
  getHealth() { /* ... */ }
}
```

Si un endpoint **no** tiene `@RateLimit()`, se aplica el **default global** (100 req/min por IP). Usa `@SkipRateLimit()` para eximir rutas.

## 🧪 Tests

```bash
# Unit tests (mockean Redis) — 31 tests
npm run test

# Tests e2e (requieren Redis con `docker compose up -d`) — 7 tests
npm run test:e2e

# Cobertura
npm run test:cov
```

## 🧮 Algoritmos: ¿cuál usar?

| Algoritmo | Estructura Redis | Ventaja | Desventaja |
|---|---|---|---|
| **Fixed Window** | String + TTL | Muy rápido, 2 comandos | Permite bursts en el borde de la ventana |
| **Sliding Window** | Sorted Set | Precisión exacta, sin bursts | Más memoria (una entrada por request) |
| **Token Bucket** | Hash | Bursts controlados, tráfico suavizado | Un poco más complejo |

## 🛠️ Scripts útiles

```bash
npm run docker:up      # levanta Redis
npm run docker:down    # detiene Redis
npm run test:integration  # unit + e2e
```

## 🧰 Stack

- [NestJS 11](https://nestjs.com) — framework
- [ioredis](https://github.com/redis/ioredis) — cliente Redis para Node.js
- [Redis 7](https://redis.io) — backend de estado (Docker)
- [Jest](https://jestjs.io) + [supertest](https://github.com/ladjs/supertest) — tests

## 📌 Alcance

- Autenticación real (JWT/OAuth) **no** incluida — se simula con el header `X-API-Key`.
- Redis en modo standalone (sin Sentinel/Cluster) — suficiente para demostrar el concepto distribuido.
