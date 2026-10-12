import type { Domain } from "@/lib/types";

/** Small line icons per kind of item. Inline SVG so they render the same on every care-home device. */
const PATHS: Record<Domain, React.ReactNode> = {
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  film: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="7.5" r="1.6" />
      <circle cx="12" cy="16.5" r="1.6" />
      <circle cx="7.5" cy="12" r="1.6" />
      <circle cx="16.5" cy="12" r="1.6" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="3" />
      <path d="M8 3l4 4 4-4" />
    </>
  ),
  books: (
    <>
      <path d="M4 5.5C6.5 4.5 9.5 4.5 12 6v13c-2.5-1.5-5.5-1.5-8-.5z" />
      <path d="M20 5.5c-2.5-1-5.5-1-8 .5v13c2.5-1.5 5.5-1.5 8-.5z" />
    </>
  ),
  audio: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="3" />
      <path d="M7 8l9-5" />
      <circle cx="15.5" cy="14" r="2.5" />
      <path d="M6.5 12.5h4M6.5 15.5h4" />
    </>
  ),
  food: (
    <>
      <circle cx="12" cy="13" r="6.5" />
      <path d="M3 4v5a2 2 0 0 0 2 2M5 4v16M21 4c-1.5 1-2 3-2 5s.5 3 2 3v8" />
    </>
  ),
  travel: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M13 9h5M13 12h5M6 9h4v5H6z" />
    </>
  ),
};

export default function DomainIcon({ domain }: { domain: Domain }) {
  return (
    <svg className="domain-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[domain] ?? PATHS.music}
      </g>
    </svg>
  );
}

export const DOMAIN_NAME: Record<Domain, string> = {
  music: "Music",
  film: "Film",
  tv: "Television",
  books: "Book",
  audio: "Radio",
  food: "Food",
  travel: "Place",
};
