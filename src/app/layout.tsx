import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindFork Office",
  description: "Pixel art office visualization for the MindFork team",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-[#1a1a2e] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
