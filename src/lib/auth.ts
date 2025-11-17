// Authentication and authorization utilities
// Ledger Reference: §2 (Roles & Access), §8 (RLS / Security), §13 (POPIA & Security)

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from './db';

export type UserRole = 'admin' | 'referrer' | 'guard' | 'internal';

export interface AuthUser {
  userId: string;
  role: UserRole;
}

// Extend Express Request to include auth
declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

/**
 * Verify Supabase JWT token
 * Per Ledger §8: Uses Supabase Auth JWT with auth.uid() semantics
 */
export async function verifySupabaseToken(
  authorizationHeader: string | undefined
): Promise<AuthUser> {
  if (!authorizationHeader) {
    throw new Error('Authorization header missing');
  }

  // Extract token from "Bearer <token>"
  const parts = authorizationHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid authorization header format');
  }

  const token = parts[1];
  if (!token) {
    throw new Error('Token missing');
  }

  // Get JWT secret from environment
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('SUPABASE_JWT_SECRET not configured');
  }

  // Optional: JWT issuer and audience validation
  const jwtIssuer = process.env.SUPABASE_JWT_ISSUER;
  const jwtAudience = process.env.SUPABASE_JWT_AUDIENCE;

  // Verify and decode JWT
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, jwtSecret, {
      issuer: jwtIssuer,
      audience: jwtAudience,
    }) as jwt.JwtPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error(`Invalid token: ${error.message}`);
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw new Error('Token verification failed');
  }

  // Extract user ID from JWT sub claim (Supabase auth.uid())
  const userId = decoded.sub;
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid token: missing user ID (sub claim)');
  }

  // Extract role from JWT claim or look up from database
  let role: UserRole;

  // Option 1: Role from JWT claim (if present)
  if (decoded.role && typeof decoded.role === 'string') {
    const roleFromJwt = decoded.role as string;
    if (['admin', 'referrer', 'guard', 'internal'].includes(roleFromJwt)) {
      role = roleFromJwt as UserRole;
    } else {
      // Invalid role in JWT, fall back to DB lookup
      role = await lookupUserRole(userId);
    }
  } else {
    // Option 2: Look up role from users table (preferred per Ledger)
    role = await lookupUserRole(userId);
  }

  return {
    userId,
    role,
  };
}

/**
 * Look up user role from users table
 * Per Ledger §2: Roles stored in users.role column
 */
async function lookupUserRole(userId: string): Promise<UserRole> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    const role = user.role as string;
    if (!['admin', 'referrer', 'guard', 'internal'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    return role as UserRole;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to lookup user role: ${errorMessage}`);
  }
}

/**
 * Express middleware: Require authentication
 * Verifies JWT and attaches req.auth
 * Returns 401 AUTHZ_DENIED on failure
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  verifySupabaseToken(req.headers.authorization)
    .then((authUser) => {
      req.auth = authUser;
      next();
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      console.error('Auth error:', errorMessage);
      res.status(401).json({
        error: 'AUTHZ_DENIED',
        message: errorMessage,
      });
    });
}

/**
 * Express middleware: Require specific role(s)
 * Must be used after requireAuth
 * Returns 403 AUTHZ_DENIED if role doesn't match
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'AUTHZ_DENIED',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      console.error(`Role mismatch: required ${allowedRoles.join(' or ')}, got ${req.auth.role}`);
      return res.status(403).json({
        error: 'AUTHZ_DENIED',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
}

/**
 * Optional auth middleware: Attach auth if present, but don't require it
 * Useful for endpoints that work with or without auth
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    // No auth header, continue without req.auth
    return next();
  }

  verifySupabaseToken(req.headers.authorization)
    .then((authUser) => {
      req.auth = authUser;
      next();
    })
    .catch(() => {
      // Auth failed, but continue without req.auth (optional)
      next();
    });
}

