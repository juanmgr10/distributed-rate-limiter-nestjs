Sistema de Rate Limiting Distribuido — NestJS + Redis

Sistema de **rate limiting distribuido** construido desde cero con **NestJS** y **Redis** como backend de estado compartido. Protege la API contra abusos, scraping masivo y ataques de denegación de servicio limitando el tráfico antes de que alcance la base de datos.

Características

- Tres algoritmos de rate limiting implementados desde cero sobre Redis:
  - Fixed Window: contador atómico con TTL (`INCR` + `EXPIRE`)
  - Sliding Window Log: precisión exacta con Sorted Sets (`ZREMRANGEBYSCORE` + `ZADD` + `ZCARD`)
  - Token Bucket: bursts controlados con Hash y refill atómico
- Distribuido: el estado vive en Redis (fuente de verdad única), no en la memoria de la aplicación, lo que permite **escalar horizontalmente** a múltiples instancias sin romper los límites.
-  Atomicidad real mediante  scripts Lua (`EVAL`): sin condiciones de carrera bajo concurrencia.
-  Identificación flexible : por IP, por `X-Forwarded-For` o por API key (`X-API-Key`).
- Headers HTTP estándar: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
- Guard + Interceptor globales: el Guard decide la autorización, el Interceptor añade la información a la respuesta.
- Cobertura de pruebas: 31 tests unitarios (con Redis mockeado) y 7 tests e2e con Redis real.



Puesta en marcha

 Requisitos

- Node.js 20+ y npm
- Docker + Docker Compose

 Levantar Redis

- Ejecutar `docker compose up -d`.
- El contenedor expone Redis en el puerto **6380** del host (el 6379 puede estar ocupado por un `redis-server` nativo del sistema). Dentro del contenedor, Redis sigue escuchando en el 6379.

 Configurar el entorno

- Copiar el archivo `.env.example` a `.env` si no existe. Las variables incluyen valores por defecto razonables.

 Instalar y arrancar

- Ejecutar `npm install`.
- Ejecutar `npm run start:dev`.
- La aplicación arranca en `http://localhost:3000`.

Probar el rate limiting

- Endpoint con Fixed Window (max 5/min): las 5 primeras OK, la sexta -> 429.

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "req#$i: HTTP %{http_code}\n" http://localhost:3000/limited/fixed
done
```

- Ver los headers `X-RateLimit-*`:

```bash
curl -sI http://localhost:3000/limited/fixed
```

- Rate limit por API key (contadores independientes por clave):

```bash
curl -s -H "X-API-Key: mi-clave-1" http://localhost:3000/limited/api-key
```

- Estado actual del caller sin consumir peticiones:

```bash
curl -s http://localhost:3000/rate-limit/status
```

 Endpoints de demostración

| Endpoint | Rate limit | Identificador |
|---|---|---|
| `/` | Default (100/min) | IP |
| `/health/redis` | Default (100/min) | IP |
| `/public` | Ninguno (`@SkipRateLimit`) | - |
| `/limited/fixed` | 5/min, Fixed Window | IP |
| `/limited/sliding` | 10/min, Sliding Window | IP |
| `/limited/token` | 3/min, Token Bucket | IP |
| `/limited/api-key` | 5/min, Fixed Window | `X-API-Key` |
| `/rate-limit/status` | Ninguno (solo lectura) | IP o `X-API-Key` |





Tests

- Unit tests (mockean Redis): 31 tests. Comando: `npm run test`.
- Tests e2e (requieren Redis con `docker compose up -d`): 7 tests. Comando: `npm run test:e2e`.
- Cobertura: `npm run test:cov`.

Algoritmos: criterios de seleccion

| Algoritmo | Estructura Redis | Ventaja | Desventaja |
|---|---|---|---|
| **Fixed Window** | String + TTL | Muy rapido, 2 comandos | Permite bursts en el borde de la ventana |
| **Sliding Window** | Sorted Set | Precision exacta, sin bursts | Mas memoria (una entrada por request) |
| **Token Bucket** | Hash | Bursts controlados, trafico suavizado | Un poco mas complejo |

Scripts utiles

- `npm run docker:up`: levanta Redis.
- `npm run docker:down`: detiene Redis.
- `npm run test:integration`: unit + e2e.

 Stack

- [NestJS 11](https://nestjs.com): framework.
- [ioredis](https://github.com/redis/ioredis): cliente Redis para Node.js.
- [Redis 7](https://redis.io): backend de estado (Docker).
- [Jest](https://jestjs.io) + [supertest](https://github.com/ladjs/supertest): tests.

lcance

- Autenticacion real (JWT/OAuth) no incluida: se simula con el header `X-API-Key`.
- Redis en modo standalone (sin Sentinel/Cluster): suficiente para demostrar el concepto distribuido.
