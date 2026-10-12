# Memory Lane

**Personalised, culturally grounded reminiscence plans for care-home residents, powered by Qloo's taste graph.**

Activity coordinators in UK and US care homes run reminiscence sessions every week. Most use the same generic
"1950s playlist" for everyone. Memory Lane is an agent that takes a short resident profile (first name, birth year,
where they grew up, a few things they loved, and their care needs) and builds a **one-week plan of activities**
matched to that person's own taste and to the years when their memories are strongest. It also plans **group sessions**
that find the common ground between several residents.

> Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Status: first working version. Runs end to end in mock mode
> with zero keys. Live Qloo and Gemini switch on when you add the keys.

## What it does

- **One resident → seven days**: Monday music, Tuesday films, Wednesday "a taste of home", Thursday telly, Friday
  armchair travel, Saturday stories and radio, Sunday a memory-box sing-along.
- Every item is chosen from **Qloo results** and carries a **"Why this?"** note built from the Qloo signals behind it:
  which of the resident's favourites drove it (from `feature.explainability`), its affinity score, its year compared
  with the resident's age at the time, and tags it shares with their hobbies.
- **Care adaptations** for hearing, sight, dementia stage (early, moderate or advanced change the questions, session length
  and approach), soft/IDDSI diets and diabetes.
- **Group mode** (2–6 residents): shared formative years, shared taste themes via Qloo's compare endpoint, blended picks
  labelled with who each one is likely to reach, and a 45-minute running order.
- **Printable** weekly sheet (A4 print CSS; the reasons print too).
- A visible **agent trace** ("How Memory Lane chose this") shows every tool call, its exact parameters, results and timing.

## Why it needs Qloo

Without Qloo this becomes a generic decade playlist. Qloo is what makes it **this person's** week:

| Step | Qloo call | What it adds |
|---|---|---|
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
                        ─▶ compose: items are picked by code from Qloo results;
                                    Gemini (optional) writes only the wording around them;
                                    template composer if there's no key or Gemini fails
```

The LLM never picks items. It gets the Qloo-chosen items and writes titles, steps and prompts suited to the dementia
stage, with instructions to use only the listed items by name. This keeps every recommendation grounded in Qloo and
keeps the app working with no LLM at all.

## Run it locally

Requires Node 18.18+ (tested on Node 22) and npm.

```bash
npm install
cp .env.example .env.local   # optional: leave keys blank for mock + template mode
npm run dev                  # http://localhost:3000
```

Try the example residents (Margaret from Liverpool, Walter from Chicago, Dorothy from Glasgow) on the home page, or
load all three on **Group session**.

API smoke test:

```bash
curl -s -X POST http://localhost:3000/api/plan -H 'content-type: application/json' \
  -d '{"resident":{"firstName":"Margaret","birthYear":1946,"hometown":"Liverpool","country":"United Kingdom",
       "favourites":{"artists":["Cilla Black","The Beatles"],"films":["The Sound of Music"],"tvShows":["Coronation Street"],
       "foods":["fish and chips"],"hobbies":["dancing"]},
       "constraints":{"hearing":"mild","dementiaStage":"moderate","softFoods":true}}}'
curl -s http://localhost:3000/api/status    # {"qloo":"mock"|"live","composer":"template"|"gemini"}
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `QLOO_API_KEY` | No | Qloo hackathon key, sent as `X-Api-Key`. **If it's set, the app uses the live API. If not, it uses the mock fixtures.** |
| `QLOO_BASE_URL` | No | Defaults to `https://hackathon.api.qloo.com` (hackathon keys only work there). |
| `GEMINI_API_KEY` | No | Enables Gemini for the wording layer. |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash`. |

All keys stay on the server. Only `app/api/*` routes call Qloo or Gemini, and the browser never sees a key.

## Mock mode

`lib/qloo/mock.ts` answers `/search`, `/v2/tags`, `/v2/insights` and `/v2/analysis/compare` with JSON shaped like
the documented responses. It uses a small tag-overlap model over **hand-written illustrative fixtures**
(`lib/qloo/fixtures.ts`). The fixture IDs (`mock-…`), tag IDs (`urn:tag:mock:…`) and scores are invented, and the
cafés marked "(illustrative)" are fictional. Mock and live mode go through the same normaliser and agent code.
Unknown names still work in mock mode because the mock creates a clearly-labelled placeholder entity.

**No real Qloo response data is committed to this repository**, as the hackathon terms require. `.gitignore` excludes
`qloo-cache/` and `*.qloo.json` for any local captures.

## Deploy to Vercel (free tier)

1. Push the repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. The framework preset is Next.js and no build settings need changing.
3. Add `QLOO_API_KEY`, and optionally `GEMINI_API_KEY`, under **Settings → Environment Variables**.
4. Deploy. The API routes run as Node serverless functions (`maxDuration = 60`). A single plan makes about 18 Qloo
   calls, run in parallel in each phase.

## Privacy and safety

- Use first names only. Profiles are processed in memory for one request and **never stored or logged**.
- Suggestions support the resident's care plan and never replace it. Diet notes tell staff to check IDDSI levels and
  sugar rules with the care plan and kitchen. The app gives no medical advice.

## Project layout

```
app/
  page.tsx              one-resident planner
  group/page.tsx        group session planner
  api/plan/route.ts     POST → WeekPlan
  api/group/route.ts    POST → GroupSession
  api/status/route.ts   GET  → active modes
components/             ResidentForm, PlanView, ItemCard, TraceView, ModeBadge
lib/
  qloo/client.ts        transport (HTTP | mock), normaliser, traced QlooService
  qloo/params.ts        supported params per filter.type + sanitiser
  qloo/mock.ts          mock transport
  qloo/fixtures.ts      illustrative fixtures (NOT Qloo data)
  agent/orchestrator.ts plans and runs the Qloo tool calls
  agent/composer.ts     week plan + group session composition (Gemini or template)
  agent/gemini.ts       Gemini REST client
  agent/care.ts         era maths, care adaptations, sample residents
  validate.ts           input validation
```

## Licence

MIT. See [LICENSE](./LICENSE). Recommendations powered by [Qloo](https://www.qloo.com/).
