'use strict';
// Tests for guard registration endpoint with auth
// Ledger Reference: §7 (API Surface), §24.3, §24.4, §2 (Roles & Access)
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
// Mock Supabase - MUST be before all imports
vitest_1.vi.mock('../../src/lib/db', () => {
  const mockSupabaseFrom = vitest_1.vi.fn();
  return {
    supabase: {
      from: mockSupabaseFrom,
    },
  };
});
// Mock SMS service - MUST be before all imports
vitest_1.vi.mock('../../src/lib/sms', () => {
  const mockSendWelcomeSms = vitest_1.vi.fn(() =>
    Promise.resolve({ success: true, smsEventId: 'sms-123' })
  );
  return {
    sendWelcomeSms: mockSendWelcomeSms,
    __mockSendWelcomeSms: mockSendWelcomeSms, // Export for test access
  };
});
// Mock YocoClient - MUST be before all imports (server imports payments which uses YocoClient)
vitest_1.vi.mock('../../src/lib/yoco', () => {
  return {
    YocoClient: class {
      createCharge = vitest_1.vi.fn().mockResolvedValue({
        id: 'ch_test_123',
        status: 'success',
      });
      verifyWebhookSignature = vitest_1.vi.fn().mockReturnValue(true);
    },
  };
});
const vitest_2 = require('vitest');
const supertest_1 = __importDefault(require('supertest'));
const server_1 = __importDefault(require('../../src/server'));
const jsonwebtoken_1 = __importDefault(require('jsonwebtoken'));
const dbModule = __importStar(require('../../src/lib/db'));
const smsModule = __importStar(require('../../src/lib/sms'));
const auditModule = __importStar(require('../../src/lib/audit'));
// Mock audit logging - MUST be before all imports
vitest_1.vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vitest_1.vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
    __mockLogAuditEvent: mockLogAuditEvent, // Export for test access
  };
});
// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = dbModule.supabase.from;
// Helper to create a proper mock chain for Supabase queries
// Supports: .select().eq().single() and .select().eq().eq().single()
const createSelectChain = (result) => {
  const eqChain = {
    single: vitest_1.vi.fn(() => Promise.resolve(result)),
    eq: vitest_1.vi.fn(() => ({
      single: vitest_1.vi.fn(() => Promise.resolve(result)),
      order: vitest_1.vi.fn(() => ({
        limit: vitest_1.vi.fn(() => Promise.resolve(result)),
      })),
    })),
    order: vitest_1.vi.fn(() => ({
      limit: vitest_1.vi.fn(() => Promise.resolve(result)),
    })),
    limit: vitest_1.vi.fn(() => Promise.resolve(result)),
  };
  return {
    select: vitest_1.vi.fn(() => ({
      eq: vitest_1.vi.fn(() => eqChain),
    })),
  };
};
const createInsertChain = (result) => ({
  insert: vitest_1.vi.fn(() => ({
    select: vitest_1.vi.fn(() => ({
      single: vitest_1.vi.fn(() => Promise.resolve(result)),
    })),
  })),
});
const createInsertNoSelect = () => ({
  insert: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
});
const createUpdateChain = () => ({
  update: vitest_1.vi.fn(() => ({
    eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
  })),
});
// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
/**
 * Generate a test JWT token
 */
function generateTestToken(userId, role = 'guard') {
  return jsonwebtoken_1.default.sign(
    {
      sub: userId,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    },
    TEST_JWT_SECRET
  );
}
(0, vitest_2.describe)('POST /guards/register', () => {
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    // Reset mock implementation to ensure test isolation
    mockSupabaseFrom.mockReset();
  });
  (0, vitest_2.describe)('Authentication', () => {
    (0, vitest_2.it)('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 401 for invalid token', async () => {
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 403 for guard role (not allowed)', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            single: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: { role: 'guard' },
                error: null,
              })
            ),
          })),
        })),
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(403);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
  });
  (0, vitest_2.describe)('Role-based access', () => {
    (0, vitest_2.it)('should allow referrer role to register guard', async () => {
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
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        // Anti-abuse checks (count queries return 0 - under limit)
        // Daily limit check always runs (call 1)
        // IP limit check runs if IP is available (call 2, usually available from req.ip)
        // Device limit check only runs if device_id header is provided (not in this test)
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                gte: vitest_1.vi.fn(() => ({
                  count: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        // Should not reach here
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
          language: 'en',
        });
      (0, vitest_2.expect)(response.status).toBe(201);
      (0, vitest_2.expect)(response.body.message).toBe('Guard registered successfully');
      (0, vitest_2.expect)(response.body.registration_method).toBe('referrer');
    });
    (0, vitest_2.it)('should allow admin role to register guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      // Call sequence for admin registration (no referrer_id in body):
      // 1. guards - check if guard exists
      // 2. users - create user record
      // 3. guards - create guard record
      // 4. guard_registration_events - create registration event
      // 5. guard_registration_events - update registration event with SMS status
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        if (table === 'guards' && callCount === 1) {
          // Guard lookup (doesn't exist)
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(201);
      (0, vitest_2.expect)(response.body.message).toBe('Guard registered successfully');
      (0, vitest_2.expect)(response.body.registration_method).toBe('admin');
    });
    (0, vitest_2.it)(
      'should ignore referrer_id in body when invoked by referrer (security)',
      async () => {
        const referrerToken = generateTestToken('referrer-123', 'referrer');
        // Same call sequence as referrer registration (with anti-abuse checks)
        let callCount = 0;
        mockSupabaseFrom.mockImplementation((table) => {
          callCount++;
          // Anti-abuse checks (daily limit always runs, IP limit runs if IP available)
          if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
            return {
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  gte: vitest_1.vi.fn(() => ({
                    count: vitest_1.vi.fn(() =>
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
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => ({
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => ({
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => ({
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            };
          }
          throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
        });
        // Attempt to supply different referrer_id in body (should be ignored)
        // Use a valid UUID format to pass validation, but it should still be ignored
        const response = await (0, supertest_1.default)(server_1.default)
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
        (0, vitest_2.expect)(response.status).toBe(201);
        // Should use referrer-123 from auth, not different-referrer-id from body
      }
    );
  });
  (0, vitest_2.describe)('Validation', () => {
    (0, vitest_2.it)('should validate request body', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            single: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: { role: 'admin' },
                error: null,
              })
            ),
          })),
        })),
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
    });
    (0, vitest_2.it)('should reject invalid phone number format', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            single: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: { role: 'admin' },
                error: null,
              })
            ),
          })),
        })),
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '123', // Too short
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
    });
  });
  (0, vitest_2.describe)('MSISDN hashing', () => {
    (0, vitest_2.it)('should hash MSISDN before storing (POPIA compliance)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const testPhone = '+27123456789';
      let guardInsertData = null;
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        if (table === 'guards' && callCount === 1) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn((data) => {
              guardInsertData = Array.isArray(data) ? data[0] : data;
              return {
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });
      await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: testPhone,
          name: 'Test Guard',
        });
      // Verify that msisdn_hash was provided (not plaintext)
      // Note: We can't easily verify the hash value without importing the hash function,
      // but we can verify that msisdn_hash field exists and msisdn is also present (temporary)
      (0, vitest_2.expect)(guardInsertData).toBeTruthy();
      (0, vitest_2.expect)(guardInsertData).toHaveProperty('msisdn_hash');
      // msisdn_hash should be a 64-character hex string (SHA256)
      (0, vitest_2.expect)(guardInsertData.msisdn_hash).toMatch(/^[a-f0-9]{64}$/i);
    });
  });
  (0, vitest_2.describe)('Error handling', () => {
    (0, vitest_2.it)('should handle SMS failure gracefully and still create guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      // Mock sendWelcomeSms to throw
      smsModule.__mockSendWelcomeSms.mockRejectedValueOnce(new Error('SMS provider unavailable'));
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        if (table === 'guards' && callCount === 1) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => ({
              select: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      // Guard should still be created even if SMS fails
      (0, vitest_2.expect)(response.status).toBe(201);
      (0, vitest_2.expect)(response.body.guard_id).toBe('guard-456');
      (0, vitest_2.expect)(response.body.sms_status).toBe('failed');
    });
    (0, vitest_2.it)(
      'should handle audit logging failure gracefully and still create guard',
      async () => {
        const adminToken = generateTestToken('admin-123', 'admin');
        // Mock logAuditEvent to throw
        auditModule.__mockLogAuditEvent.mockRejectedValueOnce(new Error('Audit log unavailable'));
        let callCount = 0;
        mockSupabaseFrom.mockImplementation((table) => {
          callCount++;
          if (table === 'guards' && callCount === 1) {
            return {
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => ({
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => ({
                select: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
              insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            };
          }
          throw new Error(`Unexpected supabase.from('${table}') call #${callCount}`);
        });
        const response = await (0, supertest_1.default)(server_1.default)
          .post('/guards/register')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            primary_phone: '+27123456789',
            name: 'Test Guard',
          });
        // Guard should still be created even if audit logging fails
        (0, vitest_2.expect)(response.status).toBe(201);
        (0, vitest_2.expect)(response.body.guard_id).toBe('guard-456');
        // Should not expose internal error details
        (0, vitest_2.expect)(response.body.error).toBeUndefined();
      }
    );
  });
  (0, vitest_2.describe)('Referrer validation edge cases', () => {
    (0, vitest_2.it)('should reject registration when referrer profile not found', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        // Anti-abuse checks run first
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                gte: vitest_1.vi.fn(() => ({
                  count: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(404);
      (0, vitest_2.expect)(response.body.error).toBe('PROCESSOR_ERROR');
      (0, vitest_2.expect)(response.body.message).toBe('Referrer profile not found');
    });
    (0, vitest_2.it)('should reject registration when referrer account is inactive', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        // Anti-abuse checks run first
        if (table === 'guard_registration_events' && (callCount === 1 || callCount === 2)) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                gte: vitest_1.vi.fn(() => ({
                  count: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/guards/register')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          primary_phone: '+27123456789',
          name: 'Test Guard',
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
      (0, vitest_2.expect)(response.body.message).toBe('Referrer account is not active');
    });
  });
});
(0, vitest_2.describe)('GET /guards/me', () => {
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    // Reset mock implementation to ensure test isolation
    mockSupabaseFrom.mockReset();
  });
  (0, vitest_2.describe)('Authentication', () => {
    (0, vitest_2.it)('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await (0, supertest_1.default)(server_1.default).get('/guards/me');
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 403 for non-guard role', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer');
      // Mock user lookup
      mockSupabaseFrom.mockReturnValueOnce({
        select: vitest_1.vi.fn(() => ({
          eq: vitest_1.vi.fn(() => ({
            single: vitest_1.vi.fn(() =>
              Promise.resolve({
                data: { role: 'referrer' },
                error: null,
              })
            ),
          })),
        })),
      });
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/guards/me')
        .set('Authorization', `Bearer ${referrerToken}`);
      (0, vitest_2.expect)(response.status).toBe(403);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
  });
  (0, vitest_2.describe)('Guard access', () => {
    (0, vitest_2.it)('should return guard profile for guard role', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      // Call sequence for GET /guards/me:
      // 1. guards - fetch guard profile
      // 2. qr_codes - fetch active QR code
      // 3. payments - fetch recent payments
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        if (table === 'guards' && callCount === 1) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  order: vitest_1.vi.fn(() => ({
                    limit: vitest_1.vi.fn(() =>
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
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/guards/me')
        .set('Authorization', `Bearer ${guardToken}`);
      if (response.status !== 200) {
        console.error('Response status:', response.status);
        console.error('Response body:', JSON.stringify(response.body, null, 2));
      }
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body.id).toBe('guard-123');
      (0, vitest_2.expect)(response.body.display_name).toBe('Test Guard');
    });
    (0, vitest_2.it)('should use req.auth.userId, not query param', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      let callCount = 0;
      mockSupabaseFrom.mockImplementation((table) => {
        callCount++;
        if (table === 'guards' && callCount === 1) {
          return {
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn((field, value) => {
                // Verify it's using guard-123 (from token), not query param
                (0, vitest_2.expect)(value).toBe('guard-123');
                return {
                  single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
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
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  order: vitest_1.vi.fn(() => ({
                    limit: vitest_1.vi.fn(() =>
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
      const response = await (0, supertest_1.default)(server_1.default)
        .get('/guards/me?guard_id=different-id')
        .set('Authorization', `Bearer ${guardToken}`);
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body.id).toBe('guard-123');
    });
  });
});
//# sourceMappingURL=guards.test.js.map
