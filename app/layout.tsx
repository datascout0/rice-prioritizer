import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RICE AI Prioritizer",
  description: "AI-powered RICE backlog prioritizer for PMs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
