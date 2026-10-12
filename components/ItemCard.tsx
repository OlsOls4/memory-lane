"use client";

import type { PlanItem } from "@/lib/types";

const ICON: Record<string, string> = {
  music: "♪",
  film: "🎞",
  tv: "📺",
  books: "📖",
  audio: "📻",
  food: "🍽",
  travel: "✉",
};

export default function ItemCard({ item }: { item: PlanItem }) {
  return (
    <li className="item">
      <div className="item-main">
        <span className="item-icon" aria-hidden>
          {ICON[item.domain]}
        </span>
        <span className="item-name">{item.name}</span>
        {item.year && <span className="item-year">{item.year}</span>}
        {item.isFavourite && <span className="chip chip-fav">Favourite</span>}
        {item.eraVerified && !item.isFavourite && <span className="chip chip-era">Era-matched</span>}
      </div>
      {item.appealsTo && item.appealsTo.length > 0 && (
        <div className="appeals">For: {item.appealsTo.join(", ")}</div>
      )}
      <details className="why">
        <summary>Why this?</summary>
        <p>{item.why}</p>
        <div className="chips no-print">
          {item.signals.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      </details>
    </li>
  );
}
