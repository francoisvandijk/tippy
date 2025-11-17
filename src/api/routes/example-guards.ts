// Example: Guards API routes with authentication
// Ledger Reference: §7 (API Surface), §2 (Roles & Access), §8 (RLS / Security)
// 
// NOTE: This is an example file showing how to use auth middleware.
// When P1.2/P1.3 routes are merged, apply this pattern to the actual guards.ts file.

import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../../lib/auth';

const router = Router();

/**
 * GET /guards/me
 * Get current guard's profile
 * Protected: Requires guard role
 * Per Ledger §7: Guard endpoint
 */
router.get(
  '/me',
  requireAuth, // Verify JWT and attach req.auth
  requireRole('guard'), // Ensure user has guard role
  async (req: Request, res: Response) => {
    try {
      // req.auth is guaranteed to exist after requireAuth middleware
      const guardId = req.auth!.userId; // Use auth.userId, not query param

      // Query will be automatically scoped by RLS to this guard's record
      // RLS policy: guard_select_self ensures guards can only see their own data
      const { data: guard, error } = await supabase
        .from('guards')
        .select('*')
        .eq('id', guardId)
        .single();

      if (error || !guard) {
        return res.status(404).json({
          error: 'PROCESSOR_ERROR',
          message: 'Guard not found',
        });
      }

      return res.status(200).json(guard);
    } catch (error) {
      return res.status(500).json({
        error: 'PROCESSOR_ERROR',
        message: 'Internal server error',
      });
    }
  }
);

export default router;

