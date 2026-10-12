"use client";

import type { ResidentProfile } from "@/lib/types";

export const EMPTY_RESIDENT: ResidentProfile = {
  firstName: "",
  birthYear: 1945,
  hometown: "",
  country: "United Kingdom",
  favourites: { artists: [], films: [], tvShows: [], books: [], foods: [], hobbies: [] },
  constraints: { hearing: "none", vision: "none", dementiaStage: "none", softFoods: false, diabetic: false },
};

type Fav = keyof ResidentProfile["favourites"];

const FAV_FIELDS: { key: Fav; label: string; hint: string }[] = [
  { key: "artists", label: "Singers & bands", hint: "e.g. Cilla Black, The Beatles" },
  { key: "films", label: "Films", hint: "e.g. The Sound of Music" },
  { key: "tvShows", label: "TV shows", hint: "e.g. Coronation Street" },
  { key: "books", label: "Books", hint: "optional" },
  { key: "foods", label: "Foods & places to eat", hint: "e.g. fish and chips, afternoon tea" },
  { key: "hobbies", label: "Hobbies & passions", hint: "e.g. dancing, football, knitting" },
];

export default function ResidentForm({
  value,
  onChange,
  compact = false,
}: {
  value: ResidentProfile;
  onChange: (r: ResidentProfile) => void;
  compact?: boolean;
}) {
  const set = (patch: Partial<ResidentProfile>) => onChange({ ...value, ...patch });
  const setFav = (k: Fav, text: string) =>
    onChange({ ...value, favourites: { ...value.favourites, [k]: text.split(",").map((s) => s.trimStart()) } });
  const setC = (patch: Partial<ResidentProfile["constraints"]>) =>
    onChange({ ...value, constraints: { ...value.constraints, ...patch } });

  return (
    <div className="form">
      <fieldset>
        <legend>About them</legend>
        <div className="grid">
          <label>
            First name
            <input value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Margaret" autoComplete="off" />
          </label>
          <label>
            Year of birth
            <input
              type="number"
              inputMode="numeric"
              min={1900}
              max={1990}
              value={value.birthYear}
              onChange={(e) => set({ birthYear: parseInt(e.target.value || "0", 10) })}
            />
          </label>
          <label>
            Where they grew up
            <input value={value.hometown} onChange={(e) => set({ hometown: e.target.value })} placeholder="Town or city" />
          </label>
          <label>
            Country
            <select value={value.country} onChange={(e) => set({ country: e.target.value })}>
              <option>United Kingdom</option>
              <option>United States</option>
              <option>Ireland</option>
              <option>Canada</option>
              <option>Australia</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Things they loved</legend>
        <p className="hint">Separate several with commas. A couple in each is plenty.</p>
        <div className="grid">
          {FAV_FIELDS.filter((f) => !compact || f.key !== "books").map((f) => (
            <label key={f.key}>
              {f.label}
              <input value={value.favourites[f.key].join(",")} onChange={(e) => setFav(f.key, e.target.value)} placeholder={f.hint} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Care needs</legend>
        <div className="grid">
          <label>
            Hearing
            <select value={value.constraints.hearing} onChange={(e) => setC({ hearing: e.target.value as any })}>
              <option value="none">No difficulty</option>
              <option value="mild">Some difficulty</option>
              <option value="significant">Significant difficulty</option>
            </select>
          </label>
          <label>
            Sight
            <select value={value.constraints.vision} onChange={(e) => setC({ vision: e.target.value as any })}>
              <option value="none">No difficulty</option>
              <option value="mild">Some difficulty</option>
              <option value="significant">Significant difficulty</option>
            </select>
          </label>
          <label>
            Dementia
            <select value={value.constraints.dementiaStage} onChange={(e) => setC({ dementiaStage: e.target.value as any })}>
              <option value="none">None / not known</option>
              <option value="early">Early stage</option>
              <option value="moderate">Moderate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label>
            Other dietary notes
            <input value={value.constraints.otherDietary || ""} onChange={(e) => setC({ otherDietary: e.target.value })} placeholder="e.g. vegetarian, no nuts" />
          </label>
        </div>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={value.constraints.softFoods} onChange={(e) => setC({ softFoods: e.target.checked })} />
            Soft or texture-modified foods
          </label>
          <label className="check">
            <input type="checkbox" checked={value.constraints.diabetic} onChange={(e) => setC({ diabetic: e.target.checked })} />
            Diabetic
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export function cleanResident(r: ResidentProfile): ResidentProfile {
  const tidy = (xs: string[]) => xs.map((s) => s.trim()).filter(Boolean);
  return {
    ...r,
    favourites: Object.fromEntries(Object.entries(r.favourites).map(([k, v]) => [k, tidy(v)])) as unknown as ResidentProfile["favourites"],
  };
}
