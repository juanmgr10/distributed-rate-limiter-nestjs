import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Tests e2e que requieren Redis REAL corriendo (docker compose up -d).
 * Usan prefijos de clave únicos para no chocar con datos de otros runs.
 */
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET) responde Hello World', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health/redis (GET) confirma conexión con Redis', () => {
    return request(app.getHttpServer())
      .get('/health/redis')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ status: 'ok', redis: 'OK' });
      });
  });

  it('/public (GET) no aplica rate limit (sin headers)', async () => {
    const res = await request(app.getHttpServer()).get('/public').expect(200);
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('incluye headers X-RateLimit-* en rutas limitadas', async () => {
    // Usamos /limited/sliding para no contaminar el contador de /limited/fixed
    // que el siguiente test usa de forma aislada.
    const res = await request(app.getHttpServer())
      .get('/limited/sliding')
      .expect(200);
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('bloquea con 429 cuando se excede el límite de /limited/fixed (max 5)', async () => {
    // Consumimos hasta agotar (se usa identificador único por IP, así que
    // la app responde 200 en los 5 primeros y 429 en el 6º).
    const server = app.getHttpServer();

    for (let i = 0; i < 5; i++) {
      await request(server).get('/limited/fixed').expect(200);
    }

    const blocked = await request(server).get('/limited/fixed').expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.body.message).toContain('Demasiadas peticiones');
  });

  it('rate limit por X-API-Key es independiente por clave', async () => {
    const server = app.getHttpServer();

    // key-A: 6 peticiones → 5 OK + 1 bloqueada
    for (let i = 0; i < 5; i++) {
      await request(server)
        .get('/limited/api-key')
        .set('X-API-Key', 'e2e-key-A')
        .expect(200);
    }
    await request(server)
      .get('/limited/api-key')
      .set('X-API-Key', 'e2e-key-A')
      .expect(429);

    // key-B: su primera petición debe pasar (contador independiente)
    await request(server)
      .get('/limited/api-key')
      .set('X-API-Key', 'e2e-key-B')
      .expect(200);
  });

  it('/rate-limit/status (GET) reporta estado sin consumir', async () => {
    const res = await request(app.getHttpServer())
      .get('/rate-limit/status')
      .expect(200);
    expect(res.body).toMatchObject({
      identifier: expect.any(String),
      limit: 100,
      remaining: expect.any(Number),
      allowed: expect.any(Boolean),
    });
  });
});
