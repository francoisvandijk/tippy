// Tests for admin settings set endpoint
// Ledger Reference: §7 (API Surface), §3 (Config - Admin-Editable Defaults)

import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});

// Mock audit logging - MUST be before all imports
vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
  };
});

// Mock YocoClient - MUST be before all imports
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
function generateTestToken(userId: string, role: string = 'admin'): string {
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

describe('POST /admin/settings/set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });

  describe('Auth & Roles', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app).post('/admin/settings/set').send({});

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 10.5 }],
        });

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const settingId = 'setting-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: settingId,
                      key: 'PLATFORM_FEE_PERCENT',
                      value: '10.00',
                      value_type: 'number',
                      is_locked: false,
                    },
                    error: null,
                  })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 10.5 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should return 400 if settings array is missing', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if settings array is empty', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject disallowed setting keys', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: null,
                    error: { code: 'PGRST116' },
                  })
                ),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PAYMENT_PROVIDER', value: 'Stripe' }], // Locked key
        });

      expect(response.status).toBe(207); // Partial success/failure
      expect(response.body.results[0].status).toBe('error');
      expect(response.body.results[0].error).toContain('not allowed');
    });

    it('should reject updates to locked settings', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const settingId = 'setting-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: settingId,
                      key: 'PLATFORM_FEE_PERCENT',
                      value: '10.00',
                      value_type: 'number',
                      is_locked: true, // Locked!
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 10.5 }],
        });

      expect(response.status).toBe(207);
      expect(response.body.results[0].status).toBe('error');
      expect(response.body.results[0].error).toContain('locked');
    });
  });

  describe('Core Behaviour', () => {
    it('should update allowed setting successfully', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const settingId = 'setting-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: settingId,
                      key: 'PLATFORM_FEE_PERCENT',
                      value: '10.00',
                      value_type: 'number',
                      is_locked: false,
                    },
                    error: null,
                  })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 10.5 }],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.updated).toBe(1);
      expect(response.body.results[0].status).toBe('success');
      expect(response.body.results[0].old_value).toBe('10.00');
      expect(response.body.results[0].new_value).toBe('10.5');
    });

    it('should validate percentage range (0-100)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const settingId = 'setting-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: settingId,
                      key: 'PLATFORM_FEE_PERCENT',
                      value: '10.00',
                      value_type: 'number',
                      is_locked: false,
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 150 }], // Invalid: > 100
        });

      expect(response.status).toBe(207);
      expect(response.body.results[0].status).toBe('error');
      expect(response.body.results[0].error).toContain('between 0 and 100');
    });

    it('should validate value type matches setting type', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const settingId = 'setting-123';

      // Mock user lookup for auth
      mockSupabaseFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { role: 'admin' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'app_settings') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: settingId,
                      key: 'PLATFORM_FEE_PERCENT',
                      value: '10.00',
                      value_type: 'number',
                      is_locked: false,
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        };
      });

      const response = await request(app)
        .post('/admin/settings/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          settings: [{ key: 'PLATFORM_FEE_PERCENT', value: 'not-a-number' }], // Wrong type
        });

      expect(response.status).toBe(207);
      expect(response.body.results[0].status).toBe('error');
      expect(response.body.results[0].error).toContain('type mismatch');
    });
  });
});


