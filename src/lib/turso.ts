// lib/turso.ts — libSQL (Turso) client + Drizzle ORM 共用實例
//
// Phase: 1b (P1-3 by Forge — 新建)
// Spec source: reports/architecture/memory-webapp-architecture-v2-20260509.md §B.3 §D.1
//
// Env var fallback（.env.example 註解 + Lens P1-B 機會點）：
//   TURSO_DATABASE_URL > TURSO_URL  （新環境用前者，既有 .env.local 仍可用後者）
//   TURSO_AUTH_TOKEN   > TURSO_TOKEN
// 兩種命名都讀，避免「rotate 一邊另一邊還在用」的安全洞。
// 真相來源：先讀 _DATABASE_URL/_AUTH_TOKEN（Turso 官方 SDK 命名），fallback 才到舊名。
//
// 為什麼 lazy init：
//   - Vercel build 階段不一定有 env var（preview vs production），cold start 才需要
//   - admin-auth.ts 模式對齊：getSecret() 也是 lazy 讀 env

// 用 /web entry：純 HTTP libSQL client，不需 native bindings
//   - 開發機：win32-arm64 無 prebuilt @libsql/win32-arm64-msvc，必須用 /web
//   - Vercel：x64 Linux 雖支援 native，但 serverless 走 HTTP 反而更穩（不依賴 OS native）
//   - drizzle-orm/libsql 主入口會 import @libsql/client（嘗試 native），改用 /web 子 entry
import { createClient, type Client } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";

// 暴露 schema 給 application 使用（不在這裡 re-export 避免循環）
// 用法：import { db } from "@/lib/turso"; import { wikiActionRequests } from "@/lib/db/schema";

let _client: Client | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function readTursoEnv(): { url: string; authToken: string } {
  // Lens P1-B：兩種命名都讀，?? fallback。先 _DATABASE_URL（canonical）後 _URL（alias）。
  const url = process.env.TURSO_DATABASE_URL ?? process.env.TURSO_URL;
  const authToken =
    process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_TOKEN;

  if (!url || url.length === 0) {
    throw new Error(
      "TURSO_DATABASE_URL (or TURSO_URL alias) not configured. " +
        "Set in Vercel Project Settings or .env.local.",
    );
  }
  if (!authToken || authToken.length === 0) {
    throw new Error(
      "TURSO_AUTH_TOKEN (or TURSO_TOKEN alias) not configured.",
    );
  }
  return { url, authToken };
}

/**
 * 取得 libSQL raw client（Vercel serverless 安全 — 每個 lambda instance 復用）。
 * 大多數用法應該用 `db` 而非 raw client；raw client 給需要 raw SQL 的場景。
 */
export function getTursoClient(): Client {
  if (!_client) {
    const { url, authToken } = readTursoEnv();
    _client = createClient({ url, authToken });
  }
  return _client;
}

/**
 * 取得 Drizzle ORM db instance（包 libSQL client）。
 * 用法：
 *   import { db } from "@/lib/turso";
 *   import { wikiActionRequests } from "@/lib/db/schema";
 *   const rows = await db.select().from(wikiActionRequests).limit(10);
 */
export function getDb() {
  if (!_db) {
    _db = drizzle(getTursoClient());
  }
  return _db;
}

/**
 * 工廠版本（測試用，注入 client）。Phase 1 不用，留 schema 給 Phase 1e Lens AC。
 */
export function makeDb(client: Client) {
  return drizzle(client);
}

// 預設 export — application code 直接用 `import { db } from "@/lib/turso"`
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const realDb = getDb() as unknown as Record<string | symbol, unknown>;
    const v = realDb[prop];
    return typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(realDb) : v;
  },
});
