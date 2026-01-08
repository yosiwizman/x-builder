import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for publish API authentication.
 *
 * Tests the authentication flow for:
 * - r2_worker provider (requires X-Publish-Token)
 * - delete endpoint (requires X-Publish-Admin-Token)
 * - default provider (no auth required)
 */

// mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// import after mocking
import { action as publishAction } from '~/routes/api.publish';
import { action as deleteAction } from '~/routes/api.publish.delete';

// response type helpers
interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
  provider?: string;
  url?: string;
  deletedCount?: number;
}

function createMockRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request('https://test.pages.dev/api/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createMockContext(env: Record<string, string | undefined>) {
  return {
    cloudflare: {
      env,
    },
  } as unknown as Parameters<typeof publishAction>[0]['context'];
}

describe('Publish API Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('r2_worker provider auth', () => {
    it('returns 401 when X-Publish-Token is missing for r2_worker', async () => {
      const request = createMockRequest({
        files: { 'index.html': '<html></html>' },
        provider: 'r2_worker',
      });

      const context = createMockContext({
        PUBLISH_TOKEN: 'secret-token',
        R2_SITES_WORKER_URL: 'https://worker.example.com',
        R2_SITES_WORKER_TOKEN: 'internal-token',
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(401);
      expect(data.error).toContain('Missing X-Publish-Token');
    });

    it('returns 401 when X-Publish-Token is invalid for r2_worker', async () => {
      const request = createMockRequest(
        {
          files: { 'index.html': '<html></html>' },
          provider: 'r2_worker',
        },
        { 'X-Publish-Token': 'wrong-token' },
      );

      const context = createMockContext({
        PUBLISH_TOKEN: 'secret-token',
        R2_SITES_WORKER_URL: 'https://worker.example.com',
        R2_SITES_WORKER_TOKEN: 'internal-token',
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(401);
      expect(data.error).toContain('Invalid X-Publish-Token');
    });

    it('returns 500 when PUBLISH_TOKEN is not configured', async () => {
      const request = createMockRequest(
        {
          files: { 'index.html': '<html></html>' },
          provider: 'r2_worker',
        },
        { 'X-Publish-Token': 'any-token' },
      );

      const context = createMockContext({
        // PUBLISH_TOKEN not set
        R2_SITES_WORKER_URL: 'https://worker.example.com',
        R2_SITES_WORKER_TOKEN: 'internal-token',
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as ErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toContain('PUBLISH_TOKEN not set');
    });

    it('proceeds to upload when token is valid', async () => {
      // mock successful worker response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          url: 'https://worker.example.com/sites/test/deploy-123/index.html',
          deploymentId: 'deploy-123',
        }),
      });

      // mock cleanup response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const request = createMockRequest(
        {
          files: { 'index.html': '<html></html>' },
          provider: 'r2_worker',
        },
        { 'X-Publish-Token': 'secret-token' },
      );

      const context = createMockContext({
        PUBLISH_TOKEN: 'secret-token',
        R2_SITES_WORKER_URL: 'https://worker.example.com',
        R2_SITES_WORKER_TOKEN: 'internal-token',
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as SuccessResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('r2_worker');

      // verify internal token was sent to worker
      expect(mockFetch).toHaveBeenCalledWith(
        'https://worker.example.com/upload',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer internal-token',
          }),
        }),
      );
    });
  });

  describe('default pages provider (no auth)', () => {
    it('does not require auth token for default provider', async () => {
      // mock successful Pages API responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 409, // project exists
        json: async () => ({}),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            url: 'https://test.pages.dev',
            id: 'deploy-abc',
          },
        }),
      });

      const request = createMockRequest({
        files: { 'index.html': '<html></html>' },

        // no provider specified = default 'pages'
      });

      const context = createMockContext({
        CLOUDFLARE_API_TOKEN: 'cf-token',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',

        // PUBLISH_TOKEN intentionally not set - should not be required
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as SuccessResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('pages');
    });

    it('does not require auth token when provider=pages explicitly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 409,
        json: async () => ({}),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { url: 'https://test.pages.dev', id: 'deploy-abc' },
        }),
      });

      const request = createMockRequest({
        files: { 'index.html': '<html></html>' },
        provider: 'pages',
      });

      const context = createMockContext({
        CLOUDFLARE_API_TOKEN: 'cf-token',
        CLOUDFLARE_ACCOUNT_ID: 'account-123',
      });

      const response = await publishAction({ request, context, params: {} });
      const data = (await response.json()) as SuccessResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});

describe('Delete API Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when X-Publish-Admin-Token is missing', async () => {
    const request = createMockRequest({
      projectId: 'test-project',
      deploymentId: 'deploy-123-abc',
    });

    const context = createMockContext({
      PUBLISH_ADMIN_TOKEN: 'admin-secret',
      R2_SITES_WORKER_URL: 'https://worker.example.com',
      R2_SITES_WORKER_TOKEN: 'internal-token',
    });

    const response = await deleteAction({ request, context, params: {} });
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(data.error).toContain('Unauthorized');
  });

  it('returns 401 when X-Publish-Admin-Token is invalid', async () => {
    const request = new Request('https://test.pages.dev/api/publish/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publish-Admin-Token': 'wrong-token',
      },
      body: JSON.stringify({
        projectId: 'test-project',
        deploymentId: 'deploy-123-abc',
      }),
    });

    const context = createMockContext({
      PUBLISH_ADMIN_TOKEN: 'admin-secret',
      R2_SITES_WORKER_URL: 'https://worker.example.com',
      R2_SITES_WORKER_TOKEN: 'internal-token',
    });

    const response = await deleteAction({ request, context, params: {} });
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(data.error).toContain('Unauthorized');
  });

  it('returns 500 when PUBLISH_ADMIN_TOKEN is not configured', async () => {
    const request = new Request('https://test.pages.dev/api/publish/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publish-Admin-Token': 'any-token',
      },
      body: JSON.stringify({
        projectId: 'test-project',
        deploymentId: 'deploy-123-abc',
      }),
    });

    const context = createMockContext({
      // PUBLISH_ADMIN_TOKEN not set
      R2_SITES_WORKER_URL: 'https://worker.example.com',
      R2_SITES_WORKER_TOKEN: 'internal-token',
    });

    const response = await deleteAction({ request, context, params: {} });
    const data = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(500);
    expect(data.error).toContain('PUBLISH_ADMIN_TOKEN');
  });

  it('proceeds to delete when admin token is valid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        deletedCount: 3,
      }),
    });

    const request = new Request('https://test.pages.dev/api/publish/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Publish-Admin-Token': 'admin-secret',
      },
      body: JSON.stringify({
        projectId: 'test-project',
        deploymentId: 'deploy-123-abc',
      }),
    });

    const context = createMockContext({
      PUBLISH_ADMIN_TOKEN: 'admin-secret',
      R2_SITES_WORKER_URL: 'https://worker.example.com',
      R2_SITES_WORKER_TOKEN: 'internal-token',
    });

    const response = await deleteAction({ request, context, params: {} });
    const data = (await response.json()) as SuccessResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(3);

    // verify internal token was sent to worker
    expect(mockFetch).toHaveBeenCalledWith(
      'https://worker.example.com/delete',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer internal-token',
        }),
      }),
    );
  });
});
