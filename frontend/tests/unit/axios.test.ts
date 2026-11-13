import { AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
import { apiClient } from '../../src/shared/lib/axios';

describe('apiClient authentication', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('stores the renewed token returned by the backend', async () => {
    localStorage.setItem('auth_token', 'current-token');
    await apiClient.get('/auth/me', {
      adapter: async (config) => ({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'x-auth-token': 'renewed-token' }),
        config,
      }),
    });

    expect(localStorage.getItem('auth_token')).toBe('renewed-token');
  });

  it('does not restore a token after logout while a request is in flight', async () => {
    localStorage.setItem('auth_token', 'current-token');
    await apiClient.get('/auth/me', {
      adapter: async (config) => {
        localStorage.removeItem('auth_token');
        return {
          data: {},
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders({ 'x-auth-token': 'renewed-token' }),
          config,
        };
      },
    });

    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('does not clear a newer token when an older request returns 401', async () => {
    localStorage.setItem('auth_token', 'old-token');
    await expect(
      apiClient.get('/auth/me', {
        adapter: async (config) => {
          localStorage.setItem('auth_token', 'new-token');
          throw {
            config,
            response: {
              status: 401,
              data: {},
              headers: new AxiosHeaders(),
              config,
            },
            isAxiosError: true,
          };
        },
      }),
    ).rejects.toBeDefined();

    expect(localStorage.getItem('auth_token')).toBe('new-token');
  });

  it('clears an expired token when a media upload returns 401', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    await expect(
      apiClient.post('/media/files/video', {}, {
        adapter: async (config) => {
          throw {
            config,
            response: {
              status: 401,
              data: {},
              headers: new AxiosHeaders(),
              config,
            },
            isAxiosError: true,
          };
        },
      }),
    ).rejects.toBeDefined();

    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it.each(['/auth/send-code', '/auth/verify-code'])(
    'does not retry a rate-limited login request (%s)',
    async (url) => {
      let attempts = 0;
      await expect(
        apiClient.post(url, {}, {
          adapter: async (config) => {
            attempts += 1;
            throw {
              config,
              response: {
                status: 429,
                data: { detail: 'Too many login attempts. Try again in 1 minute.' },
                headers: new AxiosHeaders({ 'retry-after': '60' }),
                config,
              },
              isAxiosError: true,
            };
          },
        }),
      ).rejects.toBeDefined();

      expect(attempts).toBe(1);
    },
  );

  it.each(['/media/files', '/media/files/video'])(
    'does not retry media uploads after a network timeout (%s)',
    async (url) => {
      let attempts = 0;
      await expect(
        apiClient.post(url, {}, {
          adapter: async (config) => {
            attempts += 1;
            throw {
              config,
              code: 'ECONNABORTED',
              message: 'timeout',
              isAxiosError: true,
            };
          },
        }),
      ).rejects.toBeDefined();

      expect(attempts).toBe(1);
    },
  );
});
