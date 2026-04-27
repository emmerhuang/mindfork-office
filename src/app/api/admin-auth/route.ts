import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  issueToken,
  buildAdminCookie,
  buildAdminCookieClear,
  verifyAdminCookie,
} from "@/lib/admin-auth";

/**
 * POST /api/admin-auth
 *   body: { password: string }
 *   on match: 200 { ok: true } + Set-Cookie mfo_admin=<signed token>; HttpOnly
 *   on miss:  401 { ok: false }
 *
 * GET  /api/admin-auth → 200 { ok: <bool> } reflecting current cookie validity
 * DELETE /api/admin-auth → clear cookie
 */
export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = issueToken();
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildAdminCookie(token));
  return res;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: verifyAdminCookie(req) });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", buildAdminCookieClear());
  return res;
}
