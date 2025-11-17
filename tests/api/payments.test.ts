// Integration tests for payments API routes
// Ledger Reference: §7 (API Surface)

import { vi } from 'vitest';

// Mock Supabase - MUST be before all imports
const createMockChain = () => ({
  select: vi.fn(() => createMockChain()),
  eq: vi.fn(() => createMockChain()),
  single: vi.fn().mockResolvedValue({ data: {}, error: null }),
  limit: vi.fn(() => createMockChain()),
  order: vi.fn(() => createMockChain()),
  insert: vi.fn(() => ({
    select: vi.fn(() => createMockChain()),
  })),
  update: vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })),
});

vi.mock('../../src/lib/db', () => ({
  supabase: {
    from: vi.fn(() => createMockChain()),
  },
}));

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

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/server';

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

