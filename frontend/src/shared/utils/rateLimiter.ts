interface RequestLog {
  timestamp: number;
  count: number;
}

interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstSize: number;
}

class ClientRateLimiter {
  private requestLog: Map<string, RequestLog[]> = new Map();
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxRequestsPerMinute: config.maxRequestsPerMinute || 30,
      maxRequestsPerHour: config.maxRequestsPerHour || 500,
      burstSize: config.burstSize || 5,
    };
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const logs = this.requestLog.get(key) || [];

    const oneHourAgo = now - 60 * 60 * 1000;
    const recentLogs = logs.filter((log) => log.timestamp > oneHourAgo);

    const oneMinuteAgo = now - 60 * 1000;
    const minuteLogs = recentLogs.filter((log) => log.timestamp > oneMinuteAgo);
    const minuteCount = minuteLogs.reduce((sum, log) => sum + log.count, 0);

    if (minuteCount >= this.config.maxRequestsPerMinute) {
      console.warn(`Rate limit exceeded for ${key} (per minute)`);
      return false;
    }

    const hourCount = recentLogs.reduce((sum, log) => sum + log.count, 0);
    if (hourCount >= this.config.maxRequestsPerHour) {
      console.warn(`Rate limit exceeded for ${key} (per hour)`);
      return false;
    }

    const oneSecondAgo = now - 1000;
    const burstLogs = recentLogs.filter((log) => log.timestamp > oneSecondAgo);
    const burstCount = burstLogs.reduce((sum, log) => sum + log.count, 0);

    if (burstCount >= this.config.burstSize) {
      console.warn(`Burst limit exceeded for ${key}`);
      return false;
    }

    recentLogs.push({ timestamp: now, count: 1 });
    this.requestLog.set(key, recentLogs);

    return true;
  }
}

export const rateLimiter = new ClientRateLimiter();

export class ExponentialBackoff {
  private retryCount: number = 0;
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;

  constructor(
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 10000
  ) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  getNextDelay(): number {
    if (this.retryCount >= this.maxRetries) {
      return -1;
    }

    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, this.retryCount),
      this.maxDelay
    );

    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const delay = Math.floor(exponentialDelay + jitter);

    this.retryCount++;
    return delay;
  }

  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  reset(): void {
    this.retryCount = 0;
  }
}
