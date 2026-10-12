import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import ModeBadge from "@/components/ModeBadge";

export const metadata: Metadata = {
  title: "Memory Lane · personalised reminiscence plans",
  description:
    "Memory Lane helps care-home activity staff build a week of personalised, era-matched reminiscence activities using Qloo's taste graph.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#7a3b2e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <header className="site no-print">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              ❦
            </span>
            Memory Lane
          </Link>
          <nav>
            <Link href="/">One resident</Link>
            <Link href="/group">Group session</Link>
          </nav>
          <ModeBadge />
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
