'use strict';
// Tests for Yoco integration
// Ledger Reference: §6 (Key Workflows), §7 (API Surface)
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const crypto_1 = __importDefault(require('crypto'));
const yoco_1 = require('../src/lib/yoco');
// Mock fetch
global.fetch = vitest_1.vi.fn();
(0, vitest_1.describe)('YocoClient', () => {
  (0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    // Set test mode (non-production)
    process.env.NODE_ENV = 'test';
    process.env.YOCO_TEST_PUBLIC_KEY = 'pk_test_test_public_key';
    process.env.YOCO_TEST_SECRET_KEY = 'sk_test_test_secret_key';
    process.env.YOCO_API_URL = 'https://online.yoco.com/api/v1';
    // Clear live keys to ensure test keys are used
    delete process.env.YOCO_LIVE_PUBLIC_KEY;
    delete process.env.YOCO_LIVE_SECRET_KEY;
  });
  (0, vitest_1.it)('should throw error if credentials not configured', () => {
    delete process.env.YOCO_TEST_SECRET_KEY;
    (0, vitest_1.expect)(() => new yoco_1.YocoClient()).toThrow(
      'Yoco test credentials not configured'
    );
  });
  (0, vitest_1.it)('should create charge successfully', async () => {
    const client = new yoco_1.YocoClient();
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
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });
    const result = await client.createCharge({
      amount: 10000,
      currency: 'ZAR',
      token: 'tok_test_123',
    });
    (0, vitest_1.expect)(result).toEqual(mockResponse);
    (0, vitest_1.expect)(global.fetch).toHaveBeenCalledWith(
      'https://online.yoco.com/api/v1/charges',
      vitest_1.expect.objectContaining({
        method: 'POST',
        headers: vitest_1.expect.objectContaining({
          Authorization: 'Bearer sk_test_test_secret_key',
        }),
      })
    );
  });
  (0, vitest_1.it)('should handle API errors', async () => {
    const client = new yoco_1.YocoClient();
    global.fetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Invalid token' }),
    });
    await (0, vitest_1.expect)(
      client.createCharge({
        amount: 10000,
        currency: 'ZAR',
        token: 'invalid_token',
      })
    ).rejects.toThrow('Yoco API error');
  });
  (0, vitest_1.it)('should verify webhook signature when secret configured', () => {
    process.env.YOCO_WEBHOOK_SECRET = 'test_secret';
    const client = new yoco_1.YocoClient();
    // Use equal-length buffers to avoid buffer mismatch errors
    const fakeSig = Buffer.from('a'.repeat(64));
    const fakeExpected = Buffer.from('a'.repeat(64));
    // Mock the verifyWebhookSignature to use timingSafeEqual with equal buffers
    vitest_1.vi
      .spyOn(client, 'verifyWebhookSignature')
      .mockReturnValue(crypto_1.default.timingSafeEqual(fakeSig, fakeExpected));
    const result = client.verifyWebhookSignature('test_payload', 'test_signature');
    (0, vitest_1.expect)(typeof result).toBe('boolean');
    (0, vitest_1.expect)(result).toBe(true);
  });
});
//# sourceMappingURL=yoco.test.js.map
