// Account routes (Phase 3.3): sign up, sign in, sign out, who am I.
// Only mounted logic-active when accounts mode is on; in other modes
// /api/auth/me still answers so the UI knows there's no user system.

import { Router, type Request, type Response } from "express";
import {
  accountsEnabled,
  signup,
  login,
  logout,
} from "../services/auth.js";
import {
  ACCESS_COOKIE,
  setSessionCookies,
  clearSessionCookies,
} from "../middleware/auth.js";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  const found = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined;
}

export function authRouter(): Router {
  const router = Router();

  router.post("/api/auth/signup", async (req: Request, res: Response) => {
    if (!accountsEnabled()) {
      res.status(400).json({ error: "Accounts are not enabled on this server" });
      return;
    }
    const { email, password, displayName } = req.body as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    try {
      const result = await signup(email, password, displayName);
      if (result.session) {
        setSessionCookies(req, res, result.session.accessToken, result.session.refreshToken);
        res.json({ user: result.session.user });
      } else {
        res.json({ needsConfirmation: true });
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/api/auth/login", async (req: Request, res: Response) => {
    if (!accountsEnabled()) {
      res.status(400).json({ error: "Accounts are not enabled on this server" });
      return;
    }
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }
    try {
      const session = await login(email, password);
      setSessionCookies(req, res, session.accessToken, session.refreshToken);
      res.json({ user: session.user });
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/api/auth/logout", async (req: Request, res: Response) => {
    const access = readCookie(req, ACCESS_COOKIE);
    if (access) await logout(access);
    clearSessionCookies(req, res);
    res.json({ ok: true });
  });

  router.get("/api/auth/me", (req: Request, res: Response) => {
    res.json({
      accountsEnabled: accountsEnabled(),
      user: req.user ?? null,
    });
  });

  return router;
}
