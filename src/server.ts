// Main server entry point
// Ledger Reference: §7 (API Surface), §15 (Environments & Deployment)

import express, { json, urlencoded } from 'express';

import adminRouter from './api/routes/admin';
import guardsRouter from './api/routes/guards';
import paymentsRouter from './api/routes/payments';
import qrRouter from './api/routes/qr';
import referrersRouter from './api/routes/referrers';
import yocoWebhookRouter from './api/routes/yoco-webhook';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true }));

// Request logging (no PII per Ledger §13)
app.use((req, res, next) => {
  console.warn(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
// Public/User endpoints (Ledger §7)
app.use('/payments', paymentsRouter);
app.use('/payments', yocoWebhookRouter);

// Guard endpoints (Ledger §7)
app.use('/guards', guardsRouter);

// QR endpoints (Ledger §7)
app.use('/qr', qrRouter);

// Referrer endpoints (Ledger §7)
app.use('/referrers', referrersRouter);

// Admin endpoints (Ledger §7)
app.use('/admin', adminRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'PROCESSOR_ERROR',
    message: 'Internal server error',
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.warn(`Tippy API server listening on port ${PORT}`);
    console.warn(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
