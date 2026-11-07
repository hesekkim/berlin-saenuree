import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { rateLimiter, ExponentialBackoff } from '../utils/rateLimiter';

const API_BASE_URL = `${
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000'
}/api/v1`;

const backoffInstances = new Map<string, ExponentialBackoff>();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/** Media upload/optimize/delete is intentionally bursty (multi-file posts). */
function shouldSkipClientRateLimit(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return url.includes('/media/');
}

/** Login code limits last minutes; retrying them only adds more failed attempts. */
function isLoginCodeRequest(url: string | undefined): boolean {
  return url === '/auth/send-code' || url === '/auth/verify-code';
}

function getRequestToken(headers: AxiosRequestConfig['headers']): string | null {
  const authorization = headers?.Authorization;
  if (typeof authorization !== 'string') {
    return null;
  }
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

apiClient.interceptors.request.use(
  (config) => {
    const endpoint = config.url || 'unknown';
    if (
      !shouldSkipClientRateLimit(endpoint) &&
      !rateLimiter.isAllowed(endpoint)
    ) {
      const error = new Error(
        'Too many requests. Please try again in a moment.'
      );
      (error as Error & { code?: string }).code = 'RATE_LIMIT_EXCEEDED';
      return Promise.reject(error);
    }

    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    const endpoint = response.config.url || 'unknown';
    const backoff = backoffInstances.get(endpoint);
    if (backoff) {
      backoff.reset();
    }
    const refreshedToken = response.headers['x-auth-token'];
    const requestToken = getRequestToken(response.config.headers);
    if (
      typeof refreshedToken === 'string' &&
      requestToken !== null &&
      localStorage.getItem('auth_token') === requestToken
    ) {
      localStorage.setItem('auth_token', refreshedToken);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      localStorage.getItem('auth_token') ===
        getRequestToken(originalRequest.headers)
    ) {
      localStorage.removeItem('auth_token');
      return Promise.reject(error);
    }

    if (
      error.response?.status === 429 &&
      originalRequest &&
      !originalRequest._retry &&
      !isLoginCodeRequest(originalRequest.url)
    ) {
      const endpoint = originalRequest.url || 'unknown';

      let backoff = backoffInstances.get(endpoint);
      if (!backoff) {
        backoff = new ExponentialBackoff(3, 1000, 10000);
        backoffInstances.set(endpoint, backoff);
      }

      if (backoff.canRetry()) {
        const delay = backoff.getNextDelay();

        if (delay > 0) {
          console.warn(
            `Server rate limit. Retrying in ${delay}ms... (${endpoint})`
          );
          originalRequest._retry = true;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return apiClient(originalRequest);
        }
      }

      console.error(`Max retries exceeded for ${endpoint}`);
      backoffInstances.delete(endpoint);
    }

    if (
      !error.response &&
      error.code !== 'RATE_LIMIT_EXCEEDED' &&
      originalRequest &&
      !originalRequest._retry
    ) {
      const endpoint = originalRequest.url || 'unknown';

      let backoff = backoffInstances.get(endpoint);
      if (!backoff) {
        backoff = new ExponentialBackoff(2, 500, 5000);
        backoffInstances.set(endpoint, backoff);
      }

      if (backoff.canRetry()) {
        const delay = backoff.getNextDelay();

        if (delay > 0) {
          console.warn(`Network error. Retrying in ${delay}ms... (${endpoint})`);
          originalRequest._retry = true;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return apiClient(originalRequest);
        }
      }

      backoffInstances.delete(endpoint);
    }

    return Promise.reject(error);
  }
);
