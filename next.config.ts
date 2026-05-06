import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Static sprite assets — content addressed by filename, safe to immutable cache
      // Effect: 第二次訪問瀏覽器走 disk cache，省 ~8MB / 5~8 秒 RTT
      // 內容變更時靠改檔名（content-hash 或版本後綴）失效
      {
        source: '/sprites/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // 註：原始設計稿 / Lens 機會點 P2 提到 `/textures/:path*` 也要 immutable cache，
      // 但 mindfork-office 目前無 public/textures 目錄（Phaser 的 this.textures 是
      // 引擎內部 manager，與 URL 路徑無關）。spec 列名為先期保留路線，實際無此資源
      // → 不加 header，避免空路由產生誤導。日後若新增 public/textures，再補一段
      // 與 sprites 對等的設定即可。
      {
        source: '/(.*)',
        headers: [
          // task #303（2026-05-06）：Report-Only → enforce
          //
          // 仍保留 script-src/style-src 的 'unsafe-inline'，原因：
          //   1. Next.js SSR/streaming 必注入 inline <script> 攜帶 hydration data
          //   2. React `style={{}}` JSX prop 編譯為 element inline style，
          //      被 CSP style-src 攔截
          // 真正乾淨的修法是 nonce 化（middleware 注入 per-request nonce，
          // 同時用 next/script + 自製 StyleProvider），屬於既有 P1 backlog。
          // 本輪 enforce 仍有意義：
          //   - 阻擋外部惡意腳本（default-src 'self' / connect-src 'self'）
          //   - 阻擋 frame embedding（frame-ancestors 'none'）
          //   - 阻擋 form 跨域 POST、object-src、media-src
          //   - object/data URL 注入 → 全擋
          // 即「象徵意義 > 實際擋 inline，但 supply chain / clickjacking
          // 防護全面 enforce」。
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
