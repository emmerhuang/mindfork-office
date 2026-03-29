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
      <body className="h-screen bg-[#c4a87a] text-gray-800 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
