// Tests for referrer endpoints
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
        order: vi.fn(() => ({
          range: vi.fn(),
        })),
      })),
    })),
  },
}));

describe('GET /referrers/earnings/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should require referrer_id query parameter', async () => {
    const response = await request(app)
      .get('/referrers/earnings/summary')
      .send();

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid referrer_id format', async () => {
    const response = await request(app)
      .get('/referrers/earnings/summary?referrer_id=invalid-uuid')
      .send();

    expect(response.status).toBe(400);
  });
});

describe('GET /referrers/referrals', () => {
  it('should require referrer_id query parameter', async () => {
    const response = await request(app)
      .get('/referrers/referrals')
      .send();

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

