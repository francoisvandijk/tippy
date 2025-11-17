// Main server entry point
// Ledger Reference: §7 (API Surface), §15 (Environments & Deployment)

import express from 'express';
import paymentsRouter from './api/routes/payments';
import yocoWebhookRouter from './api/routes/yoco-webhook';
import guardsRouter from './api/routes/guards';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (no PII per Ledger §13)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
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

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'PROCESSOR_ERROR',
    message: 'Internal server error',
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tippy API server listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;

