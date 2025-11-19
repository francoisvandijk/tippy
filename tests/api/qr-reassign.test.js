'use strict';
// Tests for QR reassignment endpoint
// Ledger Reference: §7 (API Surface), §6.4 (QR Assignment/Reassignment), §3 (Config), §9 (Payouts)
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
// Mock audit logging - MUST be before all imports
vitest_1.vi.mock('../../src/lib/audit', () => {
  const mockLogAuditEvent = vitest_1.vi.fn(() => Promise.resolve());
  return {
    logAuditEvent: mockLogAuditEvent,
    __mockLogAuditEvent: mockLogAuditEvent, // Export for test access
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
const auditModule = __importStar(require('../../src/lib/audit'));
// Get the mocked supabase for test-specific mocks
const mockSupabaseFrom = dbModule.supabase.from;
// Helper to create a proper mock chain for Supabase queries
const createSelectChain = (result) => {
  const inChain = {
    single: vitest_1.vi.fn(() => Promise.resolve(result)),
    maybeSingle: vitest_1.vi.fn(() => Promise.resolve(result)),
  };
  const eqChain = {
    single: vitest_1.vi.fn(() => Promise.resolve(result)),
    maybeSingle: vitest_1.vi.fn(() => Promise.resolve(result)),
    in: vitest_1.vi.fn(() => inChain),
    ilike: vitest_1.vi.fn(() => ({
      maybeSingle: vitest_1.vi.fn(() => Promise.resolve(result)),
      single: vitest_1.vi.fn(() => Promise.resolve(result)),
    })),
    eq: vitest_1.vi.fn(() => ({
      single: vitest_1.vi.fn(() => Promise.resolve(result)),
      maybeSingle: vitest_1.vi.fn(() => Promise.resolve(result)),
      ilike: vitest_1.vi.fn(() => ({
        maybeSingle: vitest_1.vi.fn(() => Promise.resolve(result)),
      })),
    })),
  };
  return {
    select: vitest_1.vi.fn(() => ({
      eq: vitest_1.vi.fn(() => eqChain),
      in: vitest_1.vi.fn(() => inChain),
    })),
  };
};
const createInsertChain = (result) => ({
  insert: vitest_1.vi.fn(() => Promise.resolve(result)),
});
const createUpdateChain = () => ({
  update: vitest_1.vi.fn(() => ({
    eq: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
  })),
});
/**
 * Create a table-based mock implementation that dispatches by table name
 * instead of relying on call order. This makes tests resilient to auth changes
 * that may skip the users table lookup.
 *
 * @param config - Configuration object mapping table names to their mock responses
 * @param config.users - Optional mock for users table (if auth needs to lookup role)
 * @param config.guards - Mock for guards table
 * @param config.qr_codes - Array of mocks for qr_codes queries (in order: current QR, target QR, update old, update new)
 * @param config.payout_batches - Array of mocks for payout_batches (select, insert)
 * @param config.payout_batch_items - Mock for payout_batch_items insert
 */
function createTableBasedMock(config) {
  // Per-table call counters for tables that need multiple queries
  const qrCodesCallCount = { count: 0 };
  const payoutBatchesCallCount = { count: 0 };
  return (table) => {
    if (table === 'users' && config.users) {
      return config.users();
    }
    if (table === 'guards' && config.guards) {
      return config.guards();
    }
    if (table === 'qr_codes' && config.qr_codes) {
      const index = qrCodesCallCount.count;
      qrCodesCallCount.count++;
      if (index < config.qr_codes.length) {
        return config.qr_codes[index]();
      }
    }
    if (table === 'payout_batches' && config.payout_batches) {
      const index = payoutBatchesCallCount.count;
      payoutBatchesCallCount.count++;
      if (index < config.payout_batches.length) {
        return config.payout_batches[index]();
      }
    }
    if (table === 'payout_batch_items' && config.payout_batch_items) {
      return config.payout_batch_items();
    }
    // Default fallback for unmocked queries
    return {
      select: vitest_1.vi.fn(() => ({
        eq: vitest_1.vi.fn(() => ({
          single: vitest_1.vi.fn(() =>
            Promise.resolve({ data: null, error: { code: 'PGRST116' } })
          ),
        })),
      })),
    };
  };
}
// Test JWT secret (for generating test tokens)
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.QR_REPLACEMENT_FEE_ZAR = '10.00';
/**
 * Generate a test JWT token
 * @param userId - User ID (sub claim)
 * @param role - Optional role claim. If omitted, token won't include role, forcing auth to lookup from users table
 */
function generateTestToken(userId, role) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };
  // Only include role if explicitly provided
  // This allows tests to control whether auth middleware hits users table
  if (role !== undefined) {
    payload.role = role;
  }
  return jsonwebtoken_1.default.sign(payload, TEST_JWT_SECRET);
}
(0, vitest_2.describe)('POST /qr/reassign', () => {
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });
  (0, vitest_2.describe)('Authentication', () => {
    (0, vitest_2.it)('should return 401 AUTHZ_DENIED without Authorization header', async () => {
      const response = await (0, supertest_1.default)(server_1.default).post('/qr/reassign').send({
        qr_code: 'QR123',
      });
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 401 for invalid token', async () => {
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(401);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 403 for admin role (not allowed)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin'); // Role in token, but auth may still check
      // Mock user lookup (auth may still verify even with role in token)
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(403);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
    (0, vitest_2.it)('should return 403 for referrer role (not allowed)', async () => {
      const referrerToken = generateTestToken('referrer-123', 'referrer'); // Role in token
      // Mock user lookup (auth may still verify even with role in token)
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${referrerToken}`)
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(403);
      (0, vitest_2.expect)(response.body.error).toBe('AUTHZ_DENIED');
    });
  });
  (0, vitest_2.describe)('Validation', () => {
    (0, vitest_2.it)(
      'should return 400 VALIDATION_ERROR if neither qr_code nor short_code provided',
      async () => {
        const guardToken = generateTestToken('guard-123'); // No role claim - forces users lookup
        // Mock user lookup
        mockSupabaseFrom.mockImplementation(
          createTableBasedMock({
            users: () => ({
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
            }),
          })
        );
        const response = await (0, supertest_1.default)(server_1.default)
          .post('/qr/reassign')
          .set('Authorization', `Bearer ${guardToken}`)
          .send({});
        (0, vitest_2.expect)(response.status).toBe(400);
        (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
      }
    );
  });
  (0, vitest_2.describe)('Business Logic - Success Cases', () => {
    (0, vitest_2.it)('should successfully reassign QR card with qr_code', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-old-123';
      const newQrId = 'qr-new-456';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: currentQrId,
                      code: 'QR-OLD-123',
                      short_code: 'OLD123',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
            // 2: Find target QR
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: newQrId,
                        code: 'QR-NEW-456',
                        short_code: 'NEW456',
                        status: 'unassigned',
                        assigned_guard_id: null,
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            }),
            // 3: Update old QR
            () => createUpdateChain(),
            // 4: Update new QR
            () => createUpdateChain(),
          ],
          payout_batches: [
            // 1: Check for existing pending batch
            () => {
              const ilikeChain = {
                maybeSingle: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: null, // No existing batch, will create new one
                    error: null,
                  })
                ),
              };
              const eqChain = {
                ilike: vitest_1.vi.fn(() => ilikeChain),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => eqChain),
                })),
              };
            },
            // 2: Create pending batch
            () => createInsertChain({ data: { id: 'batch-123' }, error: null }),
          ],
          payout_batch_items: () => createInsertChain({ data: { id: 'item-123' }, error: null }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR-NEW-456',
        });
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body.message).toContain('QR card reassigned successfully');
      (0, vitest_2.expect)(response.body.old_qr.id).toBe(currentQrId);
      (0, vitest_2.expect)(response.body.new_qr.id).toBe(newQrId);
      (0, vitest_2.expect)(response.body.replacement_fee_zar_cents).toBe(1000); // R10.00 = 1000 cents
    });
    (0, vitest_2.it)('should successfully reassign QR card with short_code', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-old-123';
      const newQrId = 'qr-new-456';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: currentQrId,
                      code: 'QR-OLD-123',
                      short_code: 'OLD123',
                      status: 'assigned',
                    },
                    error: null,
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
            // 2: Find target QR
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: newQrId,
                        code: 'QR-NEW-456',
                        short_code: 'NEW456',
                        status: 'unassigned',
                        assigned_guard_id: null,
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            }),
            // 3: Update old QR
            () => createUpdateChain(),
            // 4: Update new QR
            () => createUpdateChain(),
          ],
          payout_batches: [
            // 1: Check for existing pending batch
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  ilike: vitest_1.vi.fn(() => ({
                    maybeSingle: vitest_1.vi.fn(() =>
                      Promise.resolve({
                        data: null, // No existing batch, will create new one
                        error: null,
                      })
                    ),
                  })),
                })),
              })),
            }),
            // 2: Create pending batch
            () => createInsertChain({ data: { id: 'batch-123' }, error: null }),
          ],
          payout_batch_items: () => createInsertChain({ data: { id: 'item-123' }, error: null }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          short_code: 'NEW456',
        });
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(response.body.new_qr.id).toBe(newQrId);
    });
  });
  (0, vitest_2.describe)('Business Logic - Error Cases', () => {
    (0, vitest_2.it)('should return 404 if guard not found', async () => {
      const guardToken = generateTestToken('guard-123'); // No role claim - forces users lookup
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
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
          }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(404);
      (0, vitest_2.expect)(response.body.error).toBe('PROCESSOR_ERROR');
    });
    (0, vitest_2.it)('should return 400 if guard is not active', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'pending' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      (0, vitest_2.expect)(response.body.message).toContain('not active');
    });
    (0, vitest_2.it)('should return 400 if no current QR found', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR - not found
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: null,
                    error: { code: 'PGRST116' },
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
          ],
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR123',
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      (0, vitest_2.expect)(response.body.message).toContain('No existing QR card');
    });
    (0, vitest_2.it)('should return 404 if target QR not found', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-old-123';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  in: vitest_1.vi.fn(() => ({
                    single: vitest_1.vi.fn(() =>
                      Promise.resolve({
                        data: {
                          id: currentQrId,
                          code: 'QR-OLD-123',
                          status: 'active',
                        },
                        error: null,
                      })
                    ),
                  })),
                })),
              })),
            }),
            // 2: Find target QR - not found
            () => ({
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
            }),
          ],
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR-NOT-FOUND',
        });
      (0, vitest_2.expect)(response.status).toBe(404);
      (0, vitest_2.expect)(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      (0, vitest_2.expect)(response.body.message).toContain('not found');
    });
    (0, vitest_2.it)('should return 400 if target QR is not unassigned', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-old-123';
      const newQrId = 'qr-new-456';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: currentQrId,
                      code: 'QR-OLD-123',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
            // 2: Find target QR - already assigned
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: newQrId,
                        code: 'QR-NEW-456',
                        status: 'assigned', // Already assigned
                        assigned_guard_id: 'other-guard',
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            }),
          ],
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR-NEW-456',
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      (0, vitest_2.expect)(response.body.message).toContain('not available');
    });
    (0, vitest_2.it)('should return 400 if trying to reassign to the same QR', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-same-123';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: currentQrId,
                      code: 'QR-SAME-123',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
            // 2: Find target QR - same as current
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: currentQrId, // Same QR
                        code: 'QR-SAME-123',
                        status: 'unassigned',
                        assigned_guard_id: null,
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            }),
          ],
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR-SAME-123',
        });
      (0, vitest_2.expect)(response.status).toBe(400);
      (0, vitest_2.expect)(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      (0, vitest_2.expect)(response.body.message).toContain('same QR card');
    });
  });
  (0, vitest_2.describe)('Audit Logging', () => {
    (0, vitest_2.it)('should log audit event on successful reassignment', async () => {
      const guardId = 'guard-123';
      const guardToken = generateTestToken(guardId); // No role claim - forces users lookup
      const currentQrId = 'qr-old-123';
      const newQrId = 'qr-new-456';
      mockSupabaseFrom.mockImplementation(
        createTableBasedMock({
          users: () => ({
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
          }),
          guards: () => ({
            select: vitest_1.vi.fn(() => ({
              eq: vitest_1.vi.fn(() => ({
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: { id: guardId, display_name: 'Test Guard', status: 'active' },
                    error: null,
                  })
                ),
              })),
            })),
          }),
          qr_codes: [
            // 1: Find current QR
            () => {
              const inChain = {
                single: vitest_1.vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: currentQrId,
                      code: 'QR-OLD-123',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              };
              return {
                select: vitest_1.vi.fn(() => ({
                  eq: vitest_1.vi.fn(() => ({
                    in: vitest_1.vi.fn(() => inChain),
                  })),
                })),
              };
            },
            // 2: Find target QR
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  single: vitest_1.vi.fn(() =>
                    Promise.resolve({
                      data: {
                        id: newQrId,
                        code: 'QR-NEW-456',
                        status: 'unassigned',
                        assigned_guard_id: null,
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            }),
            // 3: Update old QR
            () => createUpdateChain(),
            // 4: Update new QR
            () => createUpdateChain(),
          ],
          payout_batches: [
            // 1: Check for existing pending batch
            () => ({
              select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                  ilike: vitest_1.vi.fn(() => ({
                    maybeSingle: vitest_1.vi.fn(() =>
                      Promise.resolve({
                        data: null, // No existing batch, will create new one
                        error: null,
                      })
                    ),
                  })),
                })),
              })),
            }),
            // 2: Create pending batch
            () => createInsertChain({ data: { id: 'batch-123' }, error: null }),
          ],
          payout_batch_items: () => createInsertChain({ data: { id: 'item-123' }, error: null }),
        })
      );
      const response = await (0, supertest_1.default)(server_1.default)
        .post('/qr/reassign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          qr_code: 'QR-NEW-456',
        });
      (0, vitest_2.expect)(response.status).toBe(200);
      (0, vitest_2.expect)(auditModule.logAuditEvent).toHaveBeenCalled();
      const auditCall = auditModule.logAuditEvent.mock.calls[0][0];
      (0, vitest_2.expect)(auditCall.event_type).toBe('QR_REASSIGNED');
      (0, vitest_2.expect)(auditCall.actor_user_id).toBe(guardId);
      (0, vitest_2.expect)(auditCall.actor_role).toBe('guard');
      (0, vitest_2.expect)(auditCall.status).toBe('success');
    });
  });
});
//# sourceMappingURL=qr-reassign.test.js.map
