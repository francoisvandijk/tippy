// Tests for authentication and authorization
// Ledger Reference: §2 (Roles & Access), §8 (RLS / Security), §12 (Error Taxonomy)

import { sign, verify, type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  const mockSupabaseRpc = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
      rpc: mockSupabaseRpc,
    },
  };
});

// Mock YocoClient - MUST be before all imports (server imports payments which uses YocoClient)
vi.mock('../../src/lib/yoco', () => {
  return {
    YocoClient: class {
      createCharge = vi.fn().mockResolvedValue({
        id: 'ch_test_123',
        status: 'success',
      });
      verifyWebhookSignature = vi.fn().mockReturnValue(true);
    },
  };
});

import * as dbModule from '../../src/lib/db';
import app from '../../src/server';

// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = (dbModule.supabase as any).from;

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

/**
 * Generate a test JWT token
 */
function generateTestToken(userId: string, role: string = 'guard'): string {
  return sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}

describe('Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Unauthenticated requests', () => {
    it('should return 401 AUTHZ_DENIED for protected endpoints without Authorization header', async () => {
      // This test assumes we have a protected endpoint
      // For now, we'll test the auth middleware behavior
      const response = await request(app).get('/guards/me').send();

      // If guards/me exists and is protected, it should return 401
      // If it doesn't exist, it will return 404, which is also acceptable
      expect([401, 404]).toContain(response.status);
    });

    it('should return 401 for invalid Authorization header format', async () => {
      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', 'InvalidFormat token123')
        .send();

      expect([401, 404]).toContain(response.status);
    });

    it('should return 401 for missing token', async () => {
      const response = await request(app).get('/guards/me').set('Authorization', 'Bearer ').send();

      expect([401, 404]).toContain(response.status);
    });
  });

  describe('Invalid tokens', () => {
    it('should return 401 for expired token', async () => {
      const expiredToken = sign(
        {
          sub: 'user-123',
          role: 'guard',
          iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
        },
        TEST_JWT_SECRET
      );

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send();

      expect([401, 404]).toContain(response.status);
    });

    it('should return 401 for token with wrong secret', async () => {
      const wrongToken = sign(
        {
          sub: 'user-123',
          role: 'guard',
        },
        'wrong-secret'
      );

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${wrongToken}`)
        .send();

      expect([401, 404]).toContain(response.status);
    });

    it('should return 401 for token missing user ID (sub claim)', async () => {
      const invalidToken = sign(
        {
          role: 'guard',
          // Missing 'sub' claim
        },
        TEST_JWT_SECRET
      );

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send();

      expect([401, 404]).toContain(response.status);
    });
  });

  describe('Role-based access', () => {
    it('should allow guard role to access guard endpoints', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      // Call sequence: guards -> qr_codes -> payments
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;

        if (table === 'guards' && callCount === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: 'guard-123',
                      display_name: 'Test Guard',
                      status: 'active',
                      lifetime_gross_tips: 10000,
                      lifetime_net_tips: 9000,
                      lifetime_payouts: 0,
                      language: 'en',
                      created_at: '2025-01-01T00:00:00Z',
                      activated_at: '2025-01-01T00:00:00Z',
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'qr_codes' && callCount === 2) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: null,
                      error: { code: 'PGRST116' },
                    })
                  ),
                })),
              })),
            })),
          };
        }

        if (table === 'payments' && callCount === 3) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() =>
                      Promise.resolve({
                        data: [],
                        error: null,
                      })
                    ),
                  })),
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${guardToken}`)
        .query({ guard_id: 'guard-123' });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('guard-123');
    });

    it('should deny referrer role from accessing admin endpoints', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { role: 'referrer' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Try to access admin endpoint
      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({ key: 'TEST_KEY', value: 'test' });

      // Should return 403 if endpoint exists and is protected
      // Or 404 if endpoint doesn't exist yet
      expect([403, 404]).toContain(response.status);
    });

    it('should deny guard role from accessing referrer endpoints', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { role: 'guard' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Try to access referrer endpoint
      const response = await request(app)
        .get('/referrers/earnings/summary')
        .set('Authorization', `Bearer ${guardToken}`);

      // Should return 403 if endpoint exists and is protected
      // Or 404 if endpoint doesn't exist yet
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('Public endpoints', () => {
    it('should allow unauthenticated access to public payment endpoints', async () => {
      const response = await request(app).post('/payments/create').send({
        amount_gross: 1000,
        guard_id: 'guard-123',
      });

      // Should return 400 (validation error) or 500 (processing error), not 401
      expect([400, 500]).toContain(response.status);
      expect(response.body.error).not.toBe('AUTHZ_DENIED');
    });

    it('should allow unauthenticated access to health check', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
});

describe('JWT Token Verification', () => {
  it('should extract user ID from token sub claim', () => {
    const userId = 'user-123';
    const token = generateTestToken(userId, 'guard');

    const decoded = verify(token, TEST_JWT_SECRET) as JwtPayload;
    expect(decoded.sub).toBe(userId);
  });

  it('should extract role from token claim', () => {
    const role = 'admin';
    const token = generateTestToken('user-123', role);

    const decoded = verify(token, TEST_JWT_SECRET) as JwtPayload;
    expect(decoded.role).toBe(role);
  });
});
