// Phase 3.3 — accounts mode plumbing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountsEnabled, clearAuthCache } from "../src/services/auth.js";
import { authMiddleware } from "../src/middleware/auth.js";
import type { Request, Response } from "express";

function fakeReq(path: string, cookie = ""): Request {
  return { path, headers: { cookie }, secure: false } as unknown as Request;
}

function fakeRes() {
  const out = { status: 0, body: undefined as unknown, html: "", headers: [] as string[] };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(v: unknown) { out.body = v; return res; },
    type() { return res; },
    send(v: string) { out.html = v; return res; },
    appendHeader(_n: string, v: string) { out.headers.push(v); return res; },
    setHeader(_n: string, v: string) { out.headers.push(v); return res; },
  };
  return { res: res as unknown as Response, out };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  const r = fn();
  if (r instanceof Promise) return r.finally(restore);
  restore();
  return r;
}

test("accounts mode is off without Supabase env", () =>
  withEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined }, () => {
    assert.equal(accountsEnabled(), false);
  }));

test("accounts mode turns on with URL + anon key", () =>
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" }, () => {
    assert.equal(accountsEnabled(), true);
  }));

test("open mode lets requests through untouched", () =>
  withEnv(
    { SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, ACCESS_PASSWORD: undefined },
    async () => {
      let passed = false;
      const { res } = fakeRes();
      await authMiddleware(fakeReq("/api/projects"), res, () => { passed = true; });
      assert.equal(passed, true);
    }
  ));

test("accounts mode: API without a session gets 401", () =>
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" }, async () => {
    clearAuthCache();
    const { res, out } = fakeRes();
    let passed = false;
    await authMiddleware(fakeReq("/api/projects"), res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(out.status, 401);
  }));

test("accounts mode: browser without a session gets the sign-in page", () =>
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" }, async () => {
    clearAuthCache();
    const { res, out } = fakeRes();
    await authMiddleware(fakeReq("/"), res, () => undefined);
    assert.equal(out.status, 401);
    assert.match(out.html, /Create account/);
  }));

test("accounts mode: /api/auth/* passes through to its own handlers", () =>
  withEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" }, async () => {
    let passed = false;
    const { res } = fakeRes();
    await authMiddleware(fakeReq("/api/auth/login"), res, () => { passed = true; });
    assert.equal(passed, true);
  }));
