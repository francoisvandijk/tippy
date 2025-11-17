// Tests for admin endpoints
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
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}));

describe('POST /admin/qr/assign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate request body', async () => {
    const response = await request(app)
      .post('/admin/qr/assign')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid guard_id format', async () => {
    const response = await request(app)
      .post('/admin/qr/assign')
      .send({
        guard_id: 'invalid-uuid',
        qr_code_id: '123e4567-e89b-12d3-a456-426614174000',
      });

    expect(response.status).toBe(400);
  });
});

describe('POST /admin/settings/set', () => {
  it('should validate request body', async () => {
    const response = await request(app)
      .post('/admin/settings/set')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject unknown setting keys', async () => {
    const response = await request(app)
      .post('/admin/settings/set')
      .send({
        key: 'UNKNOWN_SETTING',
        value: 'test',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('POST /admin/payouts/generate', () => {
  it('should validate request body', async () => {
    const response = await request(app)
      .post('/admin/payouts/generate')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid date format', async () => {
    const response = await request(app)
      .post('/admin/payouts/generate')
      .send({
        period_start_date: 'invalid-date',
        period_end_date: '2025-01-31',
      });

    expect(response.status).toBe(400);
  });
});

