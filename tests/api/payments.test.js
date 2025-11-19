'use strict';
// Integration tests for payments API routes
// Ledger Reference: §7 (API Surface)
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
// Mock Supabase - MUST be before all imports
const createMockChain = () => ({
  select: vitest_1.vi.fn(() => createMockChain()),
  eq: vitest_1.vi.fn(() => createMockChain()),
  single: vitest_1.vi.fn().mockResolvedValue({ data: {}, error: null }),
  limit: vitest_1.vi.fn(() => createMockChain()),
  order: vitest_1.vi.fn(() => createMockChain()),
  insert: vitest_1.vi.fn(() => ({
    select: vitest_1.vi.fn(() => createMockChain()),
  })),
  update: vitest_1.vi.fn(() => ({
    eq: vitest_1.vi.fn().mockResolvedValue({ error: null }),
  })),
});
vitest_1.vi.mock('../../src/lib/db', () => ({
  supabase: {
    from: vitest_1.vi.fn(() => createMockChain()),
  },
}));
// Mock YocoClient - MUST be before all imports
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
(0, vitest_2.describe)('POST /payments/create', () => {
  (0, vitest_2.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
  });
  (0, vitest_2.it)('should validate request body', async () => {
    const response = await (0, supertest_1.default)(server_1.default)
      .post('/payments/create')
      .send({});
    (0, vitest_2.expect)(response.status).toBe(400);
    (0, vitest_2.expect)(response.body.error).toBe('VALIDATION_ERROR');
  });
  (0, vitest_2.it)('should reject invalid amount', async () => {
    const response = await (0, supertest_1.default)(server_1.default)
      .post('/payments/create')
      .send({
        amount_gross: -100,
        guard_id: '123e4567-e89b-12d3-a456-426614174000',
      });
    (0, vitest_2.expect)(response.status).toBe(400);
  });
  (0, vitest_2.it)('should reject invalid guard_id format', async () => {
    const response = await (0, supertest_1.default)(server_1.default)
      .post('/payments/create')
      .send({
        amount_gross: 10000,
        guard_id: 'invalid-uuid',
      });
    (0, vitest_2.expect)(response.status).toBe(400);
  });
});
//# sourceMappingURL=payments.test.js.map
