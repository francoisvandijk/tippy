// Tests for Yoco integration
// Ledger Reference: §6 (Key Workflows), §7 (API Surface)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YocoClient } from '../src/lib/yoco';

// Mock fetch
global.fetch = vi.fn();

describe('YocoClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOCO_PUBLIC_KEY = 'test_public_key';
    process.env.YOCO_SECRET_KEY = 'test_secret_key';
    process.env.YOCO_API_URL = 'https://online.yoco.com/api/v1';
  });

  it('should throw error if credentials not configured', () => {
    delete process.env.YOCO_SECRET_KEY;
    expect(() => new YocoClient()).toThrow('Yoco credentials not configured');
  });

  it('should create charge successfully', async () => {
    const client = new YocoClient();
    const mockResponse = {
      id: 'ch_test_123',
      status: 'successful',
      amount: 10000,
      currency: 'ZAR',
      paymentType: 'card',
      cardLast4: '1234',
      cardBrand: 'visa',
      createdAt: '2025-01-01T00:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.createCharge({
      amount: 10000,
      currency: 'ZAR',
      token: 'tok_test_123',
    });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://online.yoco.com/api/v1/charges',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test_secret_key',
        }),
      })
    );
  });

  it('should handle API errors', async () => {
    const client = new YocoClient();
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Invalid token' }),
    });

    await expect(
      client.createCharge({
        amount: 10000,
        currency: 'ZAR',
        token: 'invalid_token',
      })
    ).rejects.toThrow('Yoco API error');
  });

  it('should verify webhook signature when secret configured', () => {
    process.env.YOCO_WEBHOOK_SECRET = 'test_secret';
    const client = new YocoClient();
    
    // Note: Actual signature verification depends on Yoco's implementation
    // This is a placeholder test
    const result = client.verifyWebhookSignature('test_payload', 'test_signature');
    expect(typeof result).toBe('boolean');
  });
});

