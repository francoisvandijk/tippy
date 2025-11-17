// Tests for QR reassignment endpoint
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
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
    })),
  },
}));

describe('POST /qr/reassign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate request body', async () => {
    const response = await request(app)
      .post('/qr/reassign')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid guard_id format', async () => {
    const response = await request(app)
      .post('/qr/reassign')
      .send({
        guard_id: 'invalid-uuid',
        qr_code_id: '123e4567-e89b-12d3-a456-426614174000',
      });

    expect(response.status).toBe(400);
  });

  it('should reject invalid qr_code_id format', async () => {
    const response = await request(app)
      .post('/qr/reassign')
      .send({
        guard_id: '123e4567-e89b-12d3-a456-426614174000',
        qr_code_id: 'invalid-uuid',
      });

    expect(response.status).toBe(400);
  });
});

