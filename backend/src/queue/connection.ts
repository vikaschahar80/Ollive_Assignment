import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

let redisConnection: Redis | null = null;
let isRedisConnected = false;

/**
 * Proactively verifies if Redis is online with a strict timeout.
 * Prevents BullMQ from initializing and spamming connection logs if Redis is down.
 */
export async function initRedis(): Promise<boolean> {
  console.log(`[Redis] Connecting to ${redisHost}:${redisPort}...`);

  return new Promise((resolve) => {
    try {
      const client = new Redis({
        host: redisHost,
        port: redisPort,
        connectTimeout: 1500,     // Fail fast in 1.5 seconds
        maxRetriesPerRequest: null,
        retryStrategy: () => null, // Do not auto-retry continuously to avoid console spam
      });

      let resolved = false;

      client.on('connect', () => {
        if (!resolved) {
          resolved = true;
          isRedisConnected = true;
          redisConnection = client;
          console.log(`[Redis] Connected successfully to ${redisHost}:${redisPort}`);
          resolve(true);
        }
      });

      client.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          isRedisConnected = false;
          client.disconnect();
          console.warn(`[Redis] Connection failed: ${err.message}. Graceful log-queue fallback active.`);
          resolve(false);
        }
      });

      // Hard timeout guard
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          isRedisConnected = false;
          client.disconnect();
          console.warn(`[Redis] Connection timed out after 1.5s. Graceful log-queue fallback active.`);
          resolve(false);
        }
      }, 1800);

    } catch (err: any) {
      console.warn(`[Redis] Initialization error: ${err.message}`);
      isRedisConnected = false;
      resolve(false);
    }
  });
}

export function getRedisConnection(): Redis | null {
  return isRedisConnected ? redisConnection : null;
}

export function checkRedisConnection(): boolean {
  return isRedisConnected;
}
