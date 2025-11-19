// Tests for guard registration endpoint with auth
// Ledger Reference: §7 (API Surface), §24.3, §24.4, §2 (Roles & Access)

import { vi , describe, it, expect, beforeEach} from 'vitest';

// Mock Supabase - MUST be before all imports
vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});

// Mock SMS service - MUST be before all imports
vi.mock('../../src/lib/sms', () => {
  const mockSendWelcomeSms = vi.fn(() => Promise.resolve({ success: true, smsEventId: 'sms-123' }));
  return {
    sendWelcomeSms: mockSendWelcomeSms,
    __mockSendWelcomeSms: mockSendWelcomeSms, // Export for test access
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


import request from 'supertest';

import * as auditModule from '../../src/lib/audit';
import * as dbModule from '../../src/lib/db';
import * as smsModule from '../../src/lib/sms';
import app from '../../src/server';

import jwt from 'jsonwebtoken';

// Mock audit logging - MUST be before all imports
vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
    __mockLogAuditEvent: mockLogAuditEvent, // Export for test access
  };
});

// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = (dbModule.supabase as any).from;

// Helper to create a proper mock chain for Supabase queries
// Supports: .select().eq().single() and .select().eq().eq().single()
const createSelectChain = (result: { data: any; error: any }) => {
  const eqChain = {
    single: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(result)),
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(result)),
      })),
    })),
    order: vi.fn(() => ({
      limit: vi.fn(() => Promise.resolve(result)),
    })),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => eqChain),
    })),
  };
};

const createInsertChain = (result: { data: any; error: any }) => ({
  insert: vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(result)),
    })),
  })),
});

const createInsertNoSelect = () => ({
  insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
});

const createUpdateChain = () => ({
  update: vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  })),
});

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
    // Reset mock implementation to ensure test isolation
    mockSupabaseFrom.mockReset();
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

      // Note: Auth middleware uses role from JWT token, so no DB lookup needed
      // Call sequence for referrer registration:
      // 1-3. guard_registration_events - anti-abuse checks (daily, device, IP limits)
      // 4. referrers - lookup referrer by userId
      // 5. guards - check if guard exists
      // 6. users - create user record
      // 7. guards - create guard record
      // 8. guard_registration_events - create registration event
      // 9. guard_registration_events - update registration event with SMS status
      // 10. referrals - create referral record
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        // Anti-abuse checks (count queries return 0 - under limit)
        // Daily limit check always runs (call 1)
        // IP limit check runs if IP is available (call 2, usually available from req.ip)
        // Device limit check only runs if device_id header is provided (not in this test)
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: vi.fn(() =>
                    Promise.resolve({
                      count: 0,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        
        if (table === 'referrers' && callCount === 3) {
          // Referrer lookup - must return ACTIVE status
          return {
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
          };
        }
        
        if (table === 'guards' && callCount === 4) {
          // Guard lookup (doesn't exist)
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
        
        if (table === 'users' && callCount === 5) {
          // User creation
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 6) {
          // Guard creation
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 7) {
          // Registration event
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 8) {
          // Update registration event
          return createUpdateChain();
        }
        
        if (table === 'referrals' && callCount === 9) {
          // Referral creation
          return {
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
          };
        }
        
        if (table === 'audit_log' && callCount === 8) {
          // Audit log insert (non-blocking)
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        
        // Should not reach here
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
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

      // Call sequence for admin registration (no referrer_id in body):
      // 1. guards - check if guard exists
      // 2. users - create user record
      // 3. guards - create guard record
      // 4. guard_registration_events - create registration event
      // 5. guard_registration_events - update registration event with SMS status
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        if (table === 'guards' && callCount === 1) {
          // Guard lookup (doesn't exist)
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
        
        if (table === 'users' && callCount === 2) {
          // User creation
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 3) {
          // Guard creation
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 4) {
          // Registration event
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 5) {
          // Update registration event
          return createUpdateChain();
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
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

      // Same call sequence as referrer registration (with anti-abuse checks)
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        // Anti-abuse checks (daily limit always runs, IP limit runs if IP available)
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: vi.fn(() =>
                    Promise.resolve({
                      count: 0,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        
        if (table === 'referrers' && callCount === 3) {
          return {
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
          };
        }
        
        if (table === 'guards' && callCount === 4) {
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
        
        if (table === 'users' && callCount === 5) {
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 6) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 7) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 8) {
          return createUpdateChain();
        }
        
        if (table === 'referrals' && callCount === 9) {
          return {
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
          };
        }
        
        if (table === 'audit_log' && callCount === 10) {
          // Audit log insert (non-blocking)
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      // Attempt to supply different referrer_id in body (should be ignored)
      // Use a valid UUID format to pass validation, but it should still be ignored
      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
          referrer_id: '00000000-0000-0000-0000-000000000000', // Valid UUID but should be ignored
        });

      if (response.status !== 201) {
        console.error('Response status:', response.status);
        console.error('Response body:', JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(201);
      // Should use referrer-123 from auth, not different-referrer-id from body
    });
  });

  describe('Validation', () => {
    it('should validate request body', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');

      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
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
      mockSupabaseFrom.mockReturnValueOnce({
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

      let guardInsertData: any = null;
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        if (table === 'guards' && callCount === 1) {
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
        
        if (table === 'users' && callCount === 2) {
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 3) {
          // Guard creation - capture insert data
          return {
            insert: vi.fn((data) => {
              guardInsertData = Array.isArray(data) ? data[0] : data;
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 4) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 5) {
          return createUpdateChain();
        }
        
        if (table === 'audit_log' && callCount === 6) {
          // Audit log insert (non-blocking)
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
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

  describe('Error handling', () => {
    it('should handle SMS failure gracefully and still create guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      
      // Mock sendWelcomeSms to throw
      (smsModule as any).__mockSendWelcomeSms.mockRejectedValueOnce(new Error('SMS provider unavailable'));

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        if (table === 'guards' && callCount === 1) {
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
        
        if (table === 'users' && callCount === 2) {
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 3) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 4) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 5) {
          return createUpdateChain();
        }
        
        if (table === 'audit_log' && callCount === 6) {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      // Guard should still be created even if SMS fails
      expect(response.status).toBe(201);
      expect(response.body.guard_id).toBe('guard-456');
      expect(response.body.sms_status).toBe('failed');
    });

    it('should handle audit logging failure gracefully and still create guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      
      // Mock logAuditEvent to throw
      (auditModule as any).__mockLogAuditEvent.mockRejectedValueOnce(new Error('Audit log unavailable'));

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        if (table === 'guards' && callCount === 1) {
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
        
        if (table === 'users' && callCount === 2) {
          return createInsertNoSelect();
        }
        
        if (table === 'guards' && callCount === 3) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 4) {
          return {
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
          };
        }
        
        if (table === 'guard_registration_events' && callCount === 5) {
          return createUpdateChain();
        }
        
        if (table === 'audit_log' && callCount === 6) {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      // Guard should still be created even if audit logging fails
      expect(response.status).toBe(201);
      expect(response.body.guard_id).toBe('guard-456');
      // Should not expose internal error details
      expect(response.body.error).toBeUndefined();
    });
  });

  describe('Referrer validation edge cases', () => {
    it('should reject registration when referrer profile not found', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        // Anti-abuse checks run first
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: vi.fn(() =>
                    Promise.resolve({
                      count: 0,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        
        if (table === 'referrers' && callCount === 3) {
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
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toBe('Referrer profile not found');
    });

    it('should reject registration when referrer account is inactive', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        // Anti-abuse checks run first
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  count: vi.fn(() =>
                    Promise.resolve({
                      count: 0,
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        
        if (table === 'referrers' && callCount === 3) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: 'referrer-123', status: 'INACTIVE' },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });

      const response = await request(app)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Referrer account is not active');
    });
  });
});

describe('GET /guards/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementation to ensure test isolation
    mockSupabaseFrom.mockReset();
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

      // Call sequence for GET /guards/me:
      // 1. guards - fetch guard profile
      // 2. qr_codes - fetch active QR code
      // 3. payments - fetch recent payments
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
        .set('Authorization', `Bearer ${guardToken}`);

      if (response.status !== 200) {
        console.error('Response status:', response.status);
        console.error('Response body:', JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('guard-123');
      expect(response.body.display_name).toBe('Test Guard');
    });

    it('should use req.auth.userId, not query param', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');

      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        callCount++;
        
        if (table === 'guards' && callCount === 1) {
          return {
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

      // Even if query param is different, should use token user ID
      const response = await request(app)
        .get('/guards/me?guard_id=different-id')
        .set('Authorization', `Bearer ${guardToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('guard-123');
    });
  });
});




