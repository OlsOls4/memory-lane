import type { Metadata, Viewport } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";
import ModeBadge from "@/components/ModeBadge";
import SiteNav from "@/components/SiteNav";

// Self-hosted at build time (OFL fonts from Fontsource); no runtime requests to external font CSS.
const display = localFont({
  src: [{ path: "./fonts/young-serif-latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const body = localFont({
  src: [
    { path: "./fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/atkinson-hyperlegible-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/atkinson-hyperlegible-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Memory Lane: a week of reminiscence for each resident",
  description:
    "Memory Lane helps care-home activity staff plan a week of personalised, era-matched reminiscence activities using Qloo's taste graph.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#17263A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <header className="site no-print">
          <div className="site-inner">
            <Link href="/" className="brand" aria-label="Memory Lane, home">
              <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                <rect x="1.5" y="5.5" width="29" height="21" rx="6" fill="none" stroke="currentColor" strokeWidth="3" />
                <path d="M6 16h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
                <path d="M18 9.5v13" stroke="#F0B23A" strokeWidth="3.2" strokeLinecap="round" />
              </svg>
              Memory Lane
            </Link>
            <SiteNav />
            <ModeBadge />
          </div>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
