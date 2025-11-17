// Tests for referral endpoints
// Ledger Reference: §7 (API Surface)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/server';

// Mock Supabase
vi.mock('../../src/lib/db', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      rpc: vi.fn(),
    })),
  },
}));

describe('POST /referrals/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate request body', async () => {
    const response = await request(app)
      .post('/referrals/create')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid referrer_id format', async () => {
    const response = await request(app)
      .post('/referrals/create')
      .send({
        referrer_id: 'invalid-uuid',
        guard_msisdn: '+27123456789',
      });

    expect(response.status).toBe(400);
  });

  it('should reject missing guard_msisdn', async () => {
    const response = await request(app)
      .post('/referrals/create')
      .send({
        referrer_id: '123e4567-e89b-12d3-a456-426614174000',
      });

    expect(response.status).toBe(400);
  });
});

