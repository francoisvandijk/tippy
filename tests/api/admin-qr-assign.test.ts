// Tests for admin QR assignment endpoint
// Ledger Reference: §7 (API Surface), §6.4 (QR Assignment/Reassignment), §24.4 (Guard Registration)

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

describe('POST /admin/qr/assign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseFrom.mockReset();
  });

  describe('Auth & Roles', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app).post('/admin/qr/assign').send({});

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-admin users', async () => {
      const guardToken = generateTestToken('guard-123', 'guard');
      const response = await request(app)
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${guardToken}`)
        .send({
          guard_id: 'guard-123',
          qr_code: 'QR123',
        });

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const qrId = 'qr-123';

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

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: guardId,
                      display_name: 'Test Guard',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'qr_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: qrId,
                      code: 'QR123',
                      short_code: 'SHORT123',
                      status: 'unassigned',
                      assigned_guard_id: null,
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: guardId,
          qr_code: 'QR123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should return 400 if guard_id is missing', async () => {
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          qr_code: 'QR123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 400 if no QR identifier provided', async () => {
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: 'guard-123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Either qr_id, qr_code, or short_code');
    });

    it('should return 404 if guard not found', async () => {
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

        if (table === 'guards') {
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: 'guard-123',
          qr_code: 'QR123',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toContain('Guard not found');
    });

    it('should return 404 if QR code not found', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';

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

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: guardId,
                      display_name: 'Test Guard',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'qr_codes') {
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: guardId,
          qr_code: 'QR123',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('PROCESSOR_ERROR');
      expect(response.body.message).toContain('QR code not found');
    });

    it('should return 400 if guard is not active', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';

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

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: guardId,
                      display_name: 'Test Guard',
                      status: 'inactive',
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: guardId,
          qr_code: 'QR123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      expect(response.body.message).toContain('only active guards');
    });
  });

  describe('Core Behaviour', () => {
    it('should assign unassigned QR to guard', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const qrId = 'qr-123';
      const qrCode = 'QR123';

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

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: guardId,
                      display_name: 'Test Guard',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'qr_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: qrId,
                      code: qrCode,
                      short_code: 'SHORT123',
                      status: 'unassigned',
                      assigned_guard_id: null,
                      assigned_at: null,
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: guardId,
          qr_code: qrCode,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.qr.id).toBe(qrId);
      expect(response.body.guard.id).toBe(guardId);
      expect(response.body.qr.status).toBe('assigned');
    });

    it('should reject assignment if QR is already assigned (without force)', async () => {
      const adminToken = generateTestToken('admin-123', 'admin');
      const guardId = 'guard-123';
      const qrId = 'qr-123';
      const qrCode = 'QR123';
      const otherGuardId = 'guard-456';

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

        if (table === 'guards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: guardId,
                      display_name: 'Test Guard',
                      status: 'active',
                    },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }

        if (table === 'qr_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: qrId,
                      code: qrCode,
                      short_code: 'SHORT123',
                      status: 'assigned',
                      assigned_guard_id: otherGuardId,
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
        .post('/admin/qr/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          guard_id: guardId,
          qr_code: qrCode,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('BUSINESS_RULE_VIOLATION');
      expect(response.body.message).toContain('already assigned');
    });
  });
});


