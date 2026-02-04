import { Redis } from "@upstash/redis";
import type { RateLimitResult } from "@/types";

// Lazy initialization of Redis client
let redis: Redis | null = null;

function getRedis(): Redis {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url || !token) {
    throw new Error("Missing Upstash Redis environment variables");
  }

  redis = new Redis({ url, token });
  return redis;
}

/**
 * Check rate limit using sliding window algorithm
 * Uses Redis sorted sets for accurate per-minute tracking
 */
export async function checkRateLimit(
  keyId: string,
  limitRpm: number
): Promise<RateLimitResult> {
  const client = getRedis();
  const windowKey = `ratelimit:${keyId}`;
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  try {
    // Use pipeline for atomic operations
    const pipeline = client.pipeline();

    // Remove entries older than 1 minute
    pipeline.zremrangebyscore(windowKey, 0, windowStart);

    // Add current request with timestamp as score
    pipeline.zadd(windowKey, {
      score: now,
      member: `${now}-${Math.random().toString(36).substring(2, 9)}`,
    });

    // Count requests in current window
    pipeline.zcard(windowKey);

    // Set TTL to auto-cleanup (slightly longer than window)
    pipeline.expire(windowKey, 70);

    const results = await pipeline.exec();
    const count = results[2] as number;

    if (count > limitRpm) {
      // Calculate retry-after based on oldest request in window
      const oldest = await client.zrange<string[]>(windowKey, 0, 0, {
        withScores: true,
      });

      let retryAfter = 60;
      if (oldest && oldest.length >= 2) {
        const oldestScore = parseFloat(oldest[1]);
        retryAfter = Math.ceil((oldestScore + 60000 - now) / 1000);
      }

      return {
        allowed: false,
        retryAfter: Math.max(1, retryAfter),
        remaining: 0,
      };
    }

    return {
      allowed: true,
      remaining: limitRpm - count,
    };
  } catch (error) {
    // On Redis failure, allow the request but log error
    console.error("Rate limit check failed:", error);
    return { allowed: true, remaining: limitRpm };
  }
}

/**
 * Reset rate limit for a key (admin operation)
 */
export async function resetRateLimit(keyId: string): Promise<void> {
  const client = getRedis();
  await client.del(`ratelimit:${keyId}`);
}
