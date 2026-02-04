import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engine - Agent Operations Platform",
  description: "Task discovery, job queue, and sandbox execution for AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
