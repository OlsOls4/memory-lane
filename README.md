# Memory Lane

**Personalised, culturally grounded reminiscence plans for care-home residents, powered by Qloo's taste graph and
NVIDIA Nemotron on Nebius Token Factory.**

Activity coordinators in UK and US care homes run reminiscence sessions every week. Most use the same generic
"1950s playlist" for everyone. Memory Lane is an agent that builds a **one-week plan of activities** matched to a
resident's own taste and to the years when their memories are strongest. It also plans **group sessions** that find the
common ground between several residents.

**Staff don't have to fill in a long profile.** The default Quick start asks for three things: when they were born
(a year, a decade or an age), where they grew up (optional), and **one thing they loved**, in any domain. The agent works
out whether that is a singer, a film, a TV show, a food or a pastime through Qloo, and makes a full week from it.

> Originally built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) (that submission lives on `main`).
> **This `nebius-nemotron` branch is the Nebius x NVIDIA hackathon build**: an NVIDIA Nemotron planning and writing
> layer on Nebius Token Factory (see [below](#nvidia-nemotron-on-nebius-token-factory-nebius-nemotron-branch)).
> Without any keys it still runs end to end in mock + template mode.

## What it does

- **Quick start (the default)**: four boxes and a big **Make a plan** button.

  | Field | Required? | Accepts |
  |---|---|---|
  | First name | optional | Wording says "this resident" if it's blank |
  | Born | **yes** | `1946`, `1940s` / `40s`, or `age 82` / `82` (decades use the mid-point, ages count back from this year) |
  | Where they grew up | optional | A town, or `Chicago, USA`. Country defaults to the UK (US etc. from the browser language) and can be changed inline. With no town the agent uses the country |
  | One thing they loved | **yes** | Free text in any domain: `Elvis`, `Coronation Street`, `afternoon tea`, `ballroom dancing` |

  **Try an example** buttons (Margaret · Cilla Black, Walter · Frank Sinatra, Dorothy · afternoon tea) build a plan in one tap.
  After the first plan, **Add more to sharpen this** offers one-tap chips (Hard of hearing, Poor eyesight, Soft foods,
  Diabetic, Dementia: early / moderate / advanced) and an "Add another favourite" box, then **Update the plan**.
  The plan shows how the agent read the favourite (for example `"Elvis" → singer/band: Elvis Presley`).
  The **full form** (every favourite type and care field) is one click away.
- **One resident → seven days**: Monday music, Tuesday films, Wednesday "a taste of home", Thursday telly, Friday
  armchair travel, Saturday stories and radio, Sunday a memory-box sing-along.
- Every item is chosen from **Qloo results** and carries a **"Why this?"** note built from the Qloo signals behind it:
  which of the resident's favourites drove it (from `feature.explainability`), its affinity score, its year compared
  with the resident's age at the time, and tags it shares with their hobbies.
- **Care adaptations** for hearing, sight, dementia stage (early, moderate or advanced change the questions, session length
  and approach), soft/IDDSI diets and diabetes.
- **Group mode** (2–6 residents, quick-add each with just born + one favourite, name optional): shared formative years, shared taste themes via Qloo's compare endpoint, blended picks
  labelled with who each one is likely to reach, and a 45-minute running order.
- **Printable** weekly sheet (A4 print CSS; the reasons print too).
- A visible **agent trace** ("How Memory Lane chose this") shows every tool call, its exact parameters, results and timing.

## Why it needs Qloo

Without Qloo this becomes a generic decade playlist. Qloo is what makes it **this person's** week:

| Step | Qloo call | What it adds |
|---|---|---|
| Infer the domain of one free-text favourite (Quick start) | one `GET /search` with `types=urn:entity:artist,urn:entity:movie,urn:entity:tv_show,urn:entity:book` plus `GET /v2/tags`, in parallel | Decides what "Elvis" or "afternoon tea" is: exact entity match, then exact tag match, then partial entity match, then any tag. Entities become seeds for every domain; tags become interest or food signals |
| Resolve favourites | `GET /search` (`types=urn:entity:artist`, `movie`, `tv_show`, `book`, `locality`) | Turns "Cilla Black" or "Liverpool" into entity IDs the taste graph understands |
| Resolve hobbies and foods | `GET /v2/tags?filter.query=…` | "dancing" or "fish and chips" become tag signals |
| Music | `GET /v2/insights` `filter.type=urn:entity:artist`, `signal.interests.entities` (artists + films + TV, cross-domain), `signal.interests.tags`, `signal.demographics.age=55_and_older`, `feature.explainability=true` | Artists that people with this taste love, not just the decade's chart hits |
| Era check for music | `GET /v2/insights` `filter.type=urn:entity:person`, `filter.date_of_birth.min/max` | The artist type has **no** release-year filter, so the agent confirms era fit by checking performers born in the right window (ages 16–40 during the resident's ages 10–25) |
| Films | `urn:entity:movie` + `filter.release_year.min/max` | Taste-matched films from the resident's formative years |
| TV | `urn:entity:tv_show` + `filter.release_year.*` + `filter.release_country` | Television is national, so TV is limited to the country they grew up in |
| Books | `urn:entity:book` + `filter.publication_year.*` | Read-aloud material |
| Radio and podcasts | `urn:entity:podcast` | Radio-style listening that echoes their tastes |
| Taste of home | `urn:entity:place` + `signal.interests.tags` (dish tags) + `filter.location.query=<hometown>` | Food places from their own town, used as conversation anchors. If the town isn't found, the agent drops the location filter and tries again, and logs that it did |
| Armchair travel | `urn:entity:destination` with the hometown locality + favourites as `signal.interests.entities` | Places associated with where they grew up |
| Group overlap | `GET /v2/analysis/compare` between each pair's resolved entities, then one blended insights call per domain inside the shared era window | What a room of residents actually has in common |

**Parameter discipline.** Qloo silently ignores parameters a `filter.type` doesn't support. `lib/qloo/params.ts`
encodes the [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type).
Every insights request goes through `sanitizeInsightsParams`, and anything removed is shown in the trace. For example,
the shared era block is visibly removed from the artist and podcast calls, which is why the person-type era check exists.

## How the agent works

```
profile ─▶ agent.plan ─▶ Phase 1: resolve (search + tags, in parallel)
                        ─▶ Phase 2: insights per domain (in parallel, era/age/country filters per type)
                        ─▶ Phase 3: verify (performer birth-date era check, re-rank, recovery on empty results)
                        ─▶ guards: era, "steer clear of" keywords, wrong-era favourite matches, last week's misses
                        ─▶ plan: Nemotron 3 Ultra picks, orders and flags from Qloo's candidates,
                                 calling back into Qloo (search / more insights) when a theme runs thin
                        ─▶ write: Nemotron 3 Super (days) ‖ Nemotron 3 Nano (prompts + follow-ups), in parallel
                        ─▶ (optional) feedback loop: "how did it go" → Nemotron 3 Super → next week's build
```

Nemotron never invents items: it chooses among Qloo entities (by alias) and writes around them. With no
`NEBIUS_API_KEY`, or if any Nemotron call fails, the deterministic order and the template composer do that job, so the
app always works with no LLM at all.

## Use it from any AI agent (MCP)

Memory Lane is also a remote MCP server at `https://memory-lane-azure-six.vercel.app/api/mcp` (Streamable HTTP, stateless, no sign-in). Tools:

- `plan_reminiscence_week`: a 7-day plan for one resident (born, loved, optional hometown and care flags).
- `plan_group_session`: a 45-minute session for 2 to 6 residents, using Qloo compare.
- `reminiscence_years`: the years someone is most likely to remember (no Qloo call).

Add it in Claude (Settings → Connectors → Add custom connector) or any MCP client with `{"mcpServers":{"memory-lane":{"url":"https://memory-lane-azure-six.vercel.app/api/mcp"}}}`. See `/agents` in the app.

## NVIDIA Nemotron on Nebius Token Factory (`nebius-nemotron` branch)

> This branch is the **Nebius x NVIDIA hackathon** build. It replaces the optional Gemini layer with a substantial
> **NVIDIA Nemotron** layer served by **[Nebius Token Factory](https://tokenfactory.nebius.com/)** (OpenAI-compatible
> API, `https://api.tokenfactory.nebius.com/v1`). Qloo still supplies every item; Nemotron decides which of them suit
> this person, in what order, why, what to leave out, how to talk about them, and how next week should change.

### Which model does what

| Step (trace label) | Model | Reasoning | What it does |
|---|---|---|---|
| **Planner** (`llm.plan`) | `nvidia/Nemotron-3-Ultra-550b-a55b` | **on** | Agentic loop with OpenAI-style tool calls. Reads the resident's profile (no name) and Qloo's candidates, then picks and orders the week, writes a "why this will land" line per item, and flags candidates that clash with their sensitivities. Tools: `qloo_search` (check one title in Qloo, era-checked), `qloo_more` (one more era-filtered `/v2/insights` for a thin theme), `submit_week`. Falls back to Super, then to the deterministic order. |
| **Notes reader** (`llm.read`) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | off | Reads staff's free-text notes and decides what to look up in Qloo (artists, titles, hobby/food tags, care flags, things to avoid). The notes never go to Qloo. |
| **Wording** (`llm.compose`) | `nvidia/nemotron-3-super-120b-a12b` | off | Titles, intros and steps for the 7 days, and the group running order. Uses only the chosen items by name. |
| **Prompts** (`llm.prompts`) | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | off | 3 conversation prompts and 2 "if they light up" follow-ups per day, matched to dementia stage. Runs in parallel with the wording. |
| **Feedback loop** (`llm.feedback`) | `nvidia/nemotron-3-super-120b-a12b` | **on** (short) | Staff tap *Loved it / Some of it / Didn't land* (plus a note) on each day. Super decides what to keep, what to drop, new favourites mentioned in the notes ("hummed Moon River") and new things to avoid; the next build re-resolves those in Qloo and the planner gets the summary. |
| **Session script** (`/api/script`) | `nvidia/Nemotron-3_5-Lightning` | off | On demand, a word-for-word script for one day so agency or new staff can run it. |
| **Care review** (`llm.review`) | `nvidia/nemotron-3-super-120b-a12b` | off | Fallback critic, only if the Ultra planner is unavailable. |
| **AI-only comparison** (`/api/compare-ai`) | `nvidia/nemotron-3-super-120b-a12b` | off | What Nemotron suggests with no Qloo access, each pick checked against Qloo. |
| **Local history** (`web.history`, optional) | Tavily search + Nano | off | With `TAVILY_API_KEY`: local history of their hometown in their decades, turned into 2–3 sourced conversation hooks on the travel day. Skipped silently without a key. |

Every model can be swapped with an env var (`NEMOTRON_PLANNER_MODEL`, `NEMOTRON_WRITER_MODEL`, `NEMOTRON_PROMPTS_MODEL`,
`NEMOTRON_READER_MODEL`, `NEMOTRON_FEEDBACK_MODEL`, `NEMOTRON_SCRIPT_MODEL`), and each role has a fallback chain
(e.g. Ultra → Super). The UI shows a subtle *Powered by NVIDIA Nemotron on Nebius Token Factory* strip with one badge
per model actually used (time, reasoning tokens, tool calls), the planner's one-line strategy, a model chip on every
Nemotron step in the trace, and a **Left out for them** list with the reason for each flag.

### Reasoning control

All four Nemotron 3 models are reasoning models: by default they spend completion tokens on a hidden reasoning trace
(`message.reasoning_content`) before answering. `lib/nemotron/client.ts` only ever reads `message.content` and
`tool_calls`, and switches reasoning per call with `chat_template_kwargs: {"enable_thinking": false|true}`
(verified on Token Factory for all four models; `/no_think` and `reasoning_effort` did **not** turn it off).
Fast calls run with reasoning off; the planner's first turn and the feedback reader run with it on and a generous
`max_tokens`. JSON calls use `response_format: {"type":"json_object"}` plus a tolerant parser.

### Grounding and safety

- The planner sees candidates as short aliases (`m1`, `f2`, …) and only aliases from Qloo results or its own Qloo tool
  results are accepted, so it cannot invent an item. Wording steps are told to use only the listed names.
- A deterministic **safety guard** always runs, with or without Nemotron: an era guard, a whole-word keyword guard on
  names and Qloo tags for anything staff asked to steer clear of ("war films" also catches wartime, battle, military…),
  removal of favourites that Qloo matched to a title from the wrong decades, and removal of last week's misses.
- Nemotron never receives a surname or address. The planner gets no name at all; wording steps get the first name only.
  Qloo still never receives names, notes or feedback text, only taste items, a decade window and a place.

### Measured latency (live Token Factory + live Qloo, October 2026)

| Call | Model | Median (range) |
|---|---|---|
| Planner, first turn (reasoning on, ~2.6–4.3k reasoning tokens) | Nemotron 3 Ultra | 11.5 s (9.7–19.6 s) |
| Planner, submit turn after tool results | Nemotron 3 Ultra | 9.2 s (1.6–15.6 s) |
| Planner total per plan (1–2 turns, 0–3 Qloo tool calls) | Nemotron 3 Ultra | 17–26 s |
| Wording, 7 days | Nemotron 3 Super | 3.5 s (3.3–4.8 s) |
| Prompts + follow-ups, 7 days | Nemotron 3 Nano | 3.7 s (2.8–6.0 s) |
| Notes reader | Nemotron 3 Nano | 1.7 s (1.5–2.0 s) |
| Feedback reader (reasoning on) | Nemotron 3 Super | 6.9 s (6.8–7.0 s) |
| Group running order | Nemotron 3 Super | 4.4 s |
| Session script | Nemotron 3.5 Lightning | 2.0 s |
| Tiny JSON ping, reasoning off | Ultra / Super / Nano / Lightning | 1.0 / 0.9 / 0.65 / 0.66 s |

A whole week takes 34–44 s end to end with live Qloo (Qloo phases run in parallel and take most of the rest), and
about 0.1 s in mock + template mode. `GET /api/status?probe=1` pings every model; `GET /api/status?latency=1` returns
the last 50 Nemotron calls with timings.

## Run it locally

Requires Node 18.18+ (tested on Node 22) and npm.

```bash
npm install
cp .env.example .env.local   # optional: leave keys blank for mock + template mode
npm run dev                  # http://localhost:3000
```

On the home page, tap **Try an example** or fill in Born + One thing they loved and press **Make a plan**. The detailed
example residents (Margaret from Liverpool, Walter from Chicago, Dorothy from Glasgow) are under **use the full form**,
and **Group session** can load quick or detailed examples.

API smoke test (minimal Quick start input, then a full profile):

```bash
curl -s -X POST http://localhost:3000/api/plan -H 'content-type: application/json' \
  -d '{"resident":{"birthDecade":"1940s","hometown":"Liverpool","loved":"Cilla Black"}}'
curl -s -X POST http://localhost:3000/api/group -H 'content-type: application/json' \
  -d '{"residents":[{"birthYear":1946,"loved":"Cilla Black"},{"age":84,"loved":"dancing"},{"birthDecade":"1930s","loved":"Frank Sinatra"}]}'
curl -s -X POST http://localhost:3000/api/plan -H 'content-type: application/json' \
  -d '{"resident":{"firstName":"Margaret","birthYear":1946,"hometown":"Liverpool","country":"United Kingdom",
       "favourites":{"artists":["Cilla Black","The Beatles"],"films":["The Sound of Music"],"tvShows":["Coronation Street"],
       "foods":["fish and chips"],"hobbies":["dancing"]},
       "constraints":{"hearing":"mild","dementiaStage":"moderate","softFoods":true}}}'
curl -s http://localhost:3000/api/status    # {"qloo":"mock"|"live","composer":"template"|"nemotron","llm":{...roles},"tavily":false}
curl -s 'http://localhost:3000/api/status?probe=1'   # one tiny call per Nemotron model, with latency
# Adapt next week from last week's feedback:
curl -s -X POST http://localhost:3000/api/plan -H 'content-type: application/json' \
  -d '{"resident":{"birthYear":1941,"hometown":"Leeds","loved":"Dusty Springfield","constraints":{"avoid":"war films"}},
       "feedback":[{"day":"Monday","domain":"music","items":["Dusty Springfield"],"reaction":"loved","note":"hummed Moon River after"},
                   {"day":"Tuesday","domain":"film","items":["Help!"],"reaction":"no"}]}'
# Word-for-word script for one day (send a day from a plan):
curl -s -X POST http://localhost:3000/api/script -H 'content-type: application/json' \
  -d '{"day":{"day":"Monday","title":"Hit parade","theme":"Songs of my youth","durationMins":30,"steps":["Play Dusty Springfield"],"prompts":["Do you know this one?"],"items":[{"name":"Dusty Springfield"}]},"resident":{"firstName":"Jean","constraints":{"dementiaStage":"moderate"}}}'
```

`/api/plan` accepts `birthYear`, `birthDecade` (`"1940s"`) or `age`; `firstName`, `hometown`, `country` and
`constraints` are optional; `loved` (string or list, top level or under `favourites`) holds free-text favourites in any
domain alongside the typed `favourites.artists / films / tvShows / books / foods / hobbies` lists.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `QLOO_API_KEY` | No | Qloo hackathon key, sent as `X-Api-Key`. **If it's set, the app uses the live API. If not, it uses the mock fixtures.** |
| `QLOO_BASE_URL` | No | Defaults to `https://hackathon.api.qloo.com` (hackathon keys only work there). |
| `NEBIUS_API_KEY` | No | Nebius Token Factory key (Bearer). Enables the NVIDIA Nemotron layer. Without it: deterministic planner + template wording. |
| `NEBIUS_BASE_URL` | No | Defaults to `https://api.tokenfactory.nebius.com/v1`. |
| `NEMOTRON` | No | Set to `off` to force template mode even when a key is present (handy for demos). |
| `NEMOTRON_PLANNER_MODEL` … `NEMOTRON_SCRIPT_MODEL` | No | Override the model per role (planner, writer, prompts, reader, feedback, script). |
| `NEMOTRON_PLANNER_BUDGET_MS` | No | Time budget for the Ultra planner loop (default 60000). |
| `TAVILY_API_KEY` | No | Optional runtime web search for local hometown history. Skipped when absent. |

All keys stay on the server. Only `app/api/*` routes call Qloo, Nebius or Tavily, and the browser never sees a key.

## Mock mode

`lib/qloo/mock.ts` answers `/search`, `/v2/tags`, `/v2/insights` and `/v2/analysis/compare` with JSON shaped like
the documented responses. It uses a small tag-overlap model over **hand-written illustrative fixtures**
(`lib/qloo/fixtures.ts`). The fixture IDs (`mock-…`), tag IDs (`urn:tag:mock:…`) and scores are invented, and the
cafés marked "(illustrative)" are fictional. Mock and live mode go through the same normaliser and agent code.
Unknown names still work in mock mode because the mock creates a clearly-labelled placeholder entity.

## Live Qloo notes (verified October 2026)

- Location filters take `"Town, Country"` (`filter.location.query`, `signal.location.query`): a bare "Glasgow" can resolve to Glasgow, Kentucky.
- With no favourite singer, the music and era-check queries use Qloo music-genre tags for the resident's formative decades
  (e.g. crooner, skiffle, Merseybeat), plus `filter.tags=urn:tag:genre:person:musician` and a birth-date window for performers.
- Food places use `filter.tags=urn:tag:genre:place:restaurant` and exclude hotels.
- Compare scores live at `results.tags[].query.score`.
- The hackathon key allows 5 requests per second, so the client spaces calls, retries 429s, caps each call's wait and
  caches identical requests within a warm function. A resident's name is never sent to Qloo; only taste items, a decade window and a place.

**No real Qloo response data is committed to this repository**, as the hackathon terms require. `.gitignore` excludes
`qloo-cache/` and `*.qloo.json` for any local captures.

## Deploy to Vercel (free tier)

1. Fork or import [github.com/OlsOls4/memory-lane](https://github.com/OlsOls4/memory-lane).
2. In Vercel: **Add New → Project**, import the repo. The framework preset is Next.js and no build settings need changing.
3. Add `QLOO_API_KEY`, and optionally `NEBIUS_API_KEY` (and `TAVILY_API_KEY`), under **Settings → Environment Variables**.
4. Deploy. The plan and group routes declare `maxDuration = 120` (the Ultra planner adds 17–26 s), so use a plan
   whose function limit allows that. A single plan makes about 18–22 Qloo calls, run in parallel in each phase.

> The `nebius-nemotron` branch is **not** deployed to the Qloo submission's Vercel project; deploy it as its own project.

## Privacy and safety

- Use first names only. Profiles are processed in memory for one request and **never stored or logged**.
- What goes where: Qloo gets taste items, a decade window and a place. Nebius Token Factory gets the care flags, the
  candidate items, staff notes and feedback text, and (for wording only) the first name. Tavily gets only the town,
  country and decades.
- Suggestions support the resident's care plan and never replace it. Diet notes tell staff to check IDDSI levels and
  sugar rules with the care plan and kitchen. The app gives no medical advice.

## Project layout

```
app/
  page.tsx              one-resident planner: Quick start (default), sharpen chips, full form
  group/page.tsx        group session planner
  api/plan/route.ts     POST → WeekPlan
  api/group/route.ts    POST → GroupSession
  api/script/route.ts   POST → word-for-word session script (Nemotron 3.5 Lightning)
  api/compare-ai/route.ts POST → Nemotron-only picks checked against Qloo
  api/mcp/route.ts      MCP server (Streamable HTTP)
  api/status/route.ts   GET  → active modes, model roles, ?probe=1, ?latency=1
components/             QuickStart, SharpenPanel, ResidentForm, PlanView, ItemCard, TraceView, ModeBadge,
                        AiLayer (Nemotron strip + model badges), DayExtras (session script, "how did it go")
lib/
  qloo/client.ts        transport (HTTP | mock), normaliser, traced QlooService
  qloo/params.ts        supported params per filter.type + sanitiser
  qloo/mock.ts          mock transport
  qloo/fixtures.ts      illustrative fixtures (NOT Qloo data)
  agent/orchestrator.ts plans and runs the Qloo tool calls (incl. readLoved: domain inference for free text)
  agent/composer.ts     week plan + group session: guards, planner, Nemotron wording/prompts or templates
  agent/planner.ts      Nemotron 3 Ultra agentic planner with Qloo tool calls
  agent/feedback.ts     "how did it go" → next week's changes
  agent/script.ts       session scripts (Lightning) with template fallback
  agent/localHistory.ts optional Tavily local-history hooks
  agent/llmAgent.ts     notes reader, care review, AI-only picks (Nemotron)
  nemotron/client.ts    Token Factory client: roles → models, fallback chains, reasoning toggle, JSON parsing
  nemotron/names.ts     model display names (shared with the UI)
  agent/care.ts         era maths, care adaptations, sample residents
  validate.ts           input validation, born/decade/age parsing, "Town, Country" splitting
```

## Licence

MIT. See [LICENSE](./LICENSE) (unchanged on this branch). Recommendations powered by [Qloo](https://www.qloo.com/);
planning and wording by [NVIDIA Nemotron](https://www.nvidia.com/en-us/ai-data-science/foundation-models/nemotron/) on
[Nebius Token Factory](https://tokenfactory.nebius.com/).
