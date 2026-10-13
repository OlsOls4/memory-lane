# What changed after 26 August 2026

Memory Lane was written entirely after 26 August 2026. The first commit is dated 12 October 2026, so everything in
this repository falls inside that window. This note lists all of it in two parts:

1. the original Qloo build on `main` (12–13 October 2026), submitted to the Qloo Agentic Hackathon, and
2. the NVIDIA Nemotron / Nebius Token Factory layer on the `nebius-nemotron` branch (13 October 2026), built for the
   Nebius x NVIDIA hackathon.

`main` and its Vercel deployment (memory-lane-azure-six.vercel.app) are unchanged by part 2.

---

## Part 1: `main`, the Qloo build (12–13 October 2026)

| Date | Commit | Change |
|---|---|---|
| 12 Oct | `70a195d` | Memory Lane v0.1: a reminiscence planner grounded in Qloo (mock and live client, agent trace, group mode, print). |
| 12 Oct | `154087f` | Quick start: one-favourite minimal input becomes the default landing flow. |
| 12 Oct | `c75db2b` | UI redesign: tuning-dial era picker, Festival-of-Britain palette (duck-egg/navy), Young Serif + Atkinson Hyperlegible, clearer agent trace and "Why this?". |
| 12 Oct | `03cba7f` | Interactive tuning dial (click, drag or arrow keys set the birth year). |
| 12 Oct | `adf6f32` | Plan layout: one centred column, sticky day shortcuts, care notes and sharpen panel below. |
| 12 Oct | `d24484f` | Print: prominent print buttons; the print sheet puts session notes first and adds "what sparked joy" lines. |
| 13 Oct | `82b2034` | Live Qloo: throttle to the 5 req/s key limit, retry 429s, cache identical calls. |
| 13 Oct | `1707b50` | Live Qloo tuning: country-qualified locations, era genre tags, musician filter for the era check, restaurant-only food, compare score reader, call timeouts. |
| 13 Oct | `14254f3` | README wording. |
| 13 Oct | `1e506c3` | Live agent progress: real steps streamed as NDJSON to a progress card/pill. |
| 13 Oct | `04e82c6` | Drop off-target podcast picks, tidy agent wording, Open Graph metadata. |
| 13 Oct | `2d3711b` | Agentic upgrades: MCP server (`/api/mcp`) and agents page, AI planner from staff notes, AI care review with Qloo backfill, with-vs-without-Qloo comparison, group common-ground chart. |
| 13 Oct | `8e5cbac` | Never show artist birth years as dates. |
| 13 Oct | `ba9bd12` | README: MCP server and AI steps. |
| 13 Oct | `bbac1ed` | Gemini: current models with fallback and retry, minimal thinking, lenient care flags, era guard, diagnostics. |
| 13 Oct | `3635bfa` | AI comparison: fairer place matching and wording. |
| 13 Oct | `e2d5f0d` | Samples name their country; fairer title matching in the AI comparison. |

---

## Part 2: `nebius-nemotron` branch, the NVIDIA Nemotron layer (13 October 2026)

### Summary

The optional Gemini wording layer is gone. In its place is an NVIDIA Nemotron layer on Nebius Token Factory
(`https://api.tokenfactory.nebius.com/v1`, OpenAI-compatible, Bearer `NEBIUS_API_KEY`). Nemotron now plans the week,
not just the wording. Qloo still supplies every item. Mock mode and the template fallback are kept, so the demo runs
with no keys at all.

### New files

- `lib/nemotron/client.ts`: the Token Factory client. It maps roles to models with fallback chains (planner
  Ultra → Super; writer and feedback Super → Nano; reader and prompts Nano → Super/Lightning; script Lightning → Nano),
  each overridable by env. It switches reasoning per call with `chat_template_kwargs.enable_thinking`, reads only
  `message.content` and `tool_calls`, splits the time budget across the chain, parses JSON leniently, and keeps an
  in-memory latency log.
- `lib/nemotron/names.ts`: model display names, shared by server and UI.
- `lib/agent/planner.ts`: the **Nemotron 3 Ultra agentic planner**. It reasons over the profile (no name) and the
  Qloo candidates (given as aliases), with three tools: `qloo_search`, `qloo_more` and `submit_week`. It picks and
  orders the week, writes "why this will land" per item, and flags sensitive candidates. Its tool calls run in parallel,
  it gets at most two tool rounds, and it is forced to submit under time pressure. Only known aliases are accepted.
- `lib/agent/feedback.ts`: the **"how did it go" loop**. Nemotron 3 Super (reasoning on) turns per-day reactions and
  notes into keep / drop / new favourites / avoid. It also has a deterministic fallback.
- `lib/agent/script.ts` and `app/api/script/route.ts`: on-demand **word-for-word session scripts** on Nemotron 3.5
  Lightning, with a template fallback.
- `lib/agent/localHistory.ts`: the **Tavily seam**. With `TAVILY_API_KEY` set, it searches the town's local history in
  the resident's decades, and Nano turns the results into 2–3 sourced hooks on the travel day. It is skipped silently
  without a key.
- `components/AiLayer.tsx`: the subtle "Powered by NVIDIA Nemotron on Nebius Token Factory" strip, with one badge per
  model used (time, reasoning tokens, tool calls) and the planner's strategy line.
- `components/DayExtras.tsx`: the "Script this session" button and script view, and the "How did it go?" controls.
- `notes/what-changed.md`: this file.

### Changed files

- `lib/agent/composer.ts`: the new pipeline is optional feedback → Nano notes reader → Qloo gather (with Tavily in
  parallel) → deterministic guards → Ultra planner (or a Super care review, or the deterministic order) → Super wording
  and Nano prompts/follow-ups in parallel. New guards: whole-word "steer clear of" keyword matching on names and tags,
  removal of favourites that Qloo matched to a wrong-era title, and exclusion of last week's misses. Late-era items are
  demoted rather than kept. The group running order now uses Super. Day mapping tolerates different JSON shapes.
- `lib/agent/llmAgent.ts`: the notes reader (Nano), care review and AI-only picks (Super) now run on Nemotron. The
  reader also extracts things to avoid and no longer turns genres into titles.
- `lib/agent/orchestrator.ts`: exports `T` and `eraGenreTags`, adds `moreCandidates()` (the planner's `qloo_more` tool)
  and `pickedFavs`.
- `lib/agent/compareAi.ts`: unchanged logic; it now uses Nemotron via `llmAgent`.
- `lib/agent/gemini.ts`: **deleted**.
- `lib/qloo/client.ts`: adds `begin()`/`end()` so long Nemotron steps stream live to the progress UI.
- `lib/types.ts`: adds `constraints.avoid`, `TraceStep.model` and `reasoningTokens`, new tool names, `PlanItem.landing`,
  `DayPlan.followUps` and `localHistory`, `DayFeedback`, `Adaptation`, `ModelUse`, and `WeekPlan.planner`, `strategy`,
  `flagged`, `adapted` and `models`. `composer` is now `"nemotron" | "template"`.
- `lib/validate.ts`: adds `constraints.avoid` and `parseFeedback()`.
- `lib/mcp.ts`: tools accept `avoid`. Plan text includes the planner, its strategy, "why this will land" lines and what
  was left out. Structured output includes `planner`, `strategy`, `flagged` and `models`.
- `app/api/plan/route.ts`: accepts `feedback`; `maxDuration` is now 120.
- `app/api/group/route.ts`: `maxDuration` is now 120.
- `app/api/status/route.ts`: reports model roles, `?probe=1` (one ping per model) and `?latency=1`.
- `app/api/compare-ai/route.ts`: now gated on `NEBIUS_API_KEY`.
- `app/page.tsx`: holds per-day feedback state and a "Plan next week" action that posts last week's reactions.
- `app/layout.tsx`: adds a quiet footer credit and updated metadata.
- `app/group/page.tsx`: shows the model strip.
- `components/PlanView.tsx`: adds the AI strip, a "What changed from last week" panel, a "Left out for them" list,
  "If they light up" follow-ups, the local-history block, a session script per day, "How did it go?" per day and a
  "Plan next week" panel.
- `components/ItemCard.tsx`: shows the planner's "why this will land" line under each item and inside "Why this?".
- `components/TraceView.tsx`: adds labels for the new steps, a model chip and reasoning tokens per step, and a Nemotron
  call count.
- `components/ModeBadge.tsx`: adds a "Nemotron" pill (green NVIDIA square) next to the Qloo mode pill.
- `components/AgentProgress.tsx`: adds stage labels for the Nemotron steps.
- `components/SharpenPanel.tsx` and `components/ResidentForm.tsx`: add a "Steer clear of" field.
- `components/QuickStart.tsx`, `components/AiCompare.tsx` and `lib/agent/care.ts`: "gemini" becomes "nemotron" in
  gating and copy.
- `app/globals.css`: appended styles for the new elements, keeping the existing duck-egg/navy palette and fonts. The one
  new colour is NVIDIA green (#76b900), used only as small accents.
- `README.md`: a new section on Nemotron and Token Factory (which model does what, reasoning control, grounding,
  measured latency), updated env vars, curl examples, layout and privacy notes.
- `.env.example`: Nebius, Nemotron and Tavily variables replace the Gemini ones.
- `LICENSE`: **unchanged (MIT)**.

### Verified against the real APIs (13 October 2026)

- Token Factory `/v1/models` lists all four models. `chat_template_kwargs.enable_thinking=false` turns reasoning off on
  all four. `/no_think` and `reasoning_effort` do not.
- Ultra returns OpenAI-style `tool_calls` with reasoning on and off.
- `npm run build` passes.
- Live end-to-end runs on Token Factory and the live Qloo API covered: plan, plan with feedback, group, script,
  compare-ai and MCP. Mock + template mode with no keys also ran.
- Latency figures are in the README.
