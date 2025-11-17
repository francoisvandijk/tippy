// Integration tests for payments API routes
// Ledger Reference: §7 (API Surface)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/server';

// Mock dependencies
vi.mock('../../src/lib/db', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  },
}));

vi.mock('../../src/lib/yoco', () => ({
  YocoClient: vi.fn(() => ({
    createCharge: vi.fn(),
  })),
}));

describe('POST /payments/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate request body', async () => {
    const response = await request(app)
      .post('/payments/create')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid amount', async () => {
    const response = await request(app)
      .post('/payments/create')
      .send({
        amount_gross: -100,
        guard_id: '123e4567-e89b-12d3-a456-426614174000',
      });

    expect(response.status).toBe(400);
  });

  it('should reject invalid guard_id format', async () => {
    const response = await request(app)
      .post('/payments/create')
      .send({
        amount_gross: 10000,
        guard_id: 'invalid-uuid',
      });

    expect(response.status).toBe(400);
  });
});

