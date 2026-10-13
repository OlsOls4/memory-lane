// Shared (client + server): display names for Nemotron model ids.

/** "nvidia/Nemotron-3-Ultra-550b-a55b" → "Nemotron 3 Ultra". */
export function shortModel(id: string): string {
  const s = (id || "").toLowerCase();
  if (s.includes("ultra")) return "Nemotron 3 Ultra";
  if (s.includes("super")) return "Nemotron 3 Super";
  if (s.includes("nano")) return "Nemotron 3 Nano";
  if (s.includes("lightning")) return "Nemotron 3.5 Lightning";
  return id.split("/").pop() || id;
}
