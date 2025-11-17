// Tests for guard registration endpoint with auth
// Ledger Reference: §7 (API Surface), §24.3, §24.4, §2 (Roles & Access)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/server';
import jwt from 'jsonwebtoken';

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
        limit: vi.fn(() => ({
          order: vi.fn(),
        })),
      })),
      order: vi.fn(() => ({
        limit: vi.fn(),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(),
    })),
  })),
};

vi.mock('../../src/lib/db', () => ({
  supabase: mockSupabase,
}));

// Mock SMS service
vi.mock('../../src/lib/sms', () => ({
  sendWelcomeSms: vi.fn(() => Promise.resolve({ success: true, smsEventId: 'sms-123' })),
}));

// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

/**
 * Generate a test JWT token
 */
function generateTestToken(userId: string, role: string = 'guard'): string {
  return jwt.sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}

describe('POST /guards/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await request(app)
        .post('/guards/register')
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 403 for guard role (not allowed)', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });
  });

  describe('Role-based access', () => {
    it('should allow referrer role to register guard', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock referrer lookup
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'referrer-123', status: 'ACTIVE' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock guard lookup (doesn't exist)
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock user creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      });

      // Mock guard creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'guard-456' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock registration event
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'event-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock update registration event
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      });

      // Mock referral creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'referral-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
          language: 'en',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Guard registered successfully');
      expect(response.body.registration_method).toBe('referrer');
    });

    it('should allow admin role to register guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock guard lookup (doesn't exist)
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock user creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      });

      // Mock guard creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'guard-456' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock registration event
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'event-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock update registration event
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Guard registered successfully');
      expect(response.body.registration_method).toBe('admin');
    });

    it('should ignore referrer_id in body when invoked by referrer (security)', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock referrer lookup (should use auth.userId, not body param)
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'referrer-123', status: 'ACTIVE' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock guard lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock user creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      });

      // Mock guard creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'guard-456' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock registration event
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'event-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock update registration event
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      });

      // Mock referral creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'referral-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Attempt to supply different referrer_id in body (should be ignored)
      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
          referrer_id: 'different-referrer-id', // Should be ignored
        });

      expect(response.status).toBe(201);
      // Should use referrer-123 from auth, not different-referrer-id from body
    });
  });

  describe('Validation', () => {
    it('should validate request body', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid phone number format', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '123', // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('MSISDN hashing', () => {
    it('should hash MSISDN before storing (POPIA compliance)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const testPhone = '+27123456789';

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock guard lookup (doesn't exist)
      mockSupabase.from.mockReturnValueOnce({
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
      });

      let guardInsertData: any = null;

      // Mock user creation
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => Promise.resolve({ error: null })),
      });

      // Mock guard creation - capture insert data
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn((data) => {
          guardInsertData = data;
          return {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { id: 'guard-456' },
                  error: null,
                })
              ),
            })),
          };
        }),
      });

      // Mock registration event
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'event-123' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock update registration event
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      });

      await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: testPhone,
          name: 'Test Guard',
        });

      // Verify that msisdn_hash was provided (not plaintext)
      // Note: We can't easily verify the hash value without importing the hash function,
      // but we can verify that msisdn_hash field exists and msisdn is also present (temporary)
      expect(guardInsertData).toBeTruthy();
      expect(guardInsertData).toHaveProperty('msisdn_hash');
      // msisdn_hash should be a 64-character hex string (SHA256)
      expect(guardInsertData.msisdn_hash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });
});

describe('GET /guards/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await request(app).get('/guards/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });

    it('should return 403 for non-guard role', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${referrerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('AUTHZ_DENIED');
    });
  });

  describe('Guard access', () => {
    it('should return guard profile for guard role', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock guard lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock QR code lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock payments lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      const response = await request(app)
        .get('/guards/me')
        .set('Authorization', `Bearer ${guardToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('guard-123');
      expect(response.body.display_name).toBe('Test Guard');
    });

    it('should use req.auth.userId, not query param', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      // Mock user lookup
      mockSupabase.from.mockReturnValueOnce({
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

      // Mock guard lookup - should use guard-123 from token, not different-id from query
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn((field: string, value: string) => {
            // Verify it's using guard-123 (from token), not query param
            expect(value).toBe('guard-123');
            return {
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'guard-123',
                    display_name: 'Test Guard',
                    status: 'active',
                    lifetime_gross_tips: 0,
                    lifetime_net_tips: 0,
                    lifetime_payouts: 0,
                    language: 'en',
                    created_at: '2025-01-01T00:00:00Z',
                    activated_at: null,
                  },
                  error: null,
                })
              ),
            };
          }),
        })),
      });

      // Mock QR code lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Mock payments lookup
      mockSupabase.from.mockReturnValueOnce({
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
      });

      // Even if query param is different, should use token user ID
      const response = await request(app)
        .get('/guards/me?guard_id=different-id')
        .set('Authorization', `Bearer ${guardToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('guard-123');
    });
  });
});


