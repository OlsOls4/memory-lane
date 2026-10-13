# Memory Lane

**Personalised, culturally grounded reminiscence plans for care-home residents, powered by Qloo's taste graph.**

Activity coordinators in UK and US care homes run reminiscence sessions every week. Most use the same generic
"1950s playlist" for everyone. Memory Lane is an agent that builds a **one-week plan of activities** matched to a
resident's own taste and to the years when their memories are strongest. It also plans **group sessions** that find the
common ground between several residents.

**Staff don't have to fill in a long profile.** The default Quick start asks for three things: when they were born
(a year, a decade or an age), where they grew up (optional), and **one thing they loved**, in any domain. The agent works
out whether that is a singer, a film, a TV show, a food or a pastime through Qloo, and makes a full week from it.

> Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). The live demo runs on the real Qloo hackathon API.
> Without a key it still runs end to end in mock mode; Gemini wording is optional.

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
curl -s http://localhost:3000/api/status    # {"qloo":"mock"|"live","composer":"template"|"gemini"}
```

`/api/plan` accepts `birthYear`, `birthDecade` (`"1940s"`) or `age`; `firstName`, `hometown`, `country` and
`constraints` are optional; `loved` (string or list, top level or under `favourites`) holds free-text favourites in any
domain alongside the typed `favourites.artists / films / tvShows / books / foods / hobbies` lists.

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
  page.tsx              one-resident planner: Quick start (default), sharpen chips, full form
  group/page.tsx        group session planner
  api/plan/route.ts     POST → WeekPlan
  api/group/route.ts    POST → GroupSession
  api/status/route.ts   GET  → active modes
components/             QuickStart, SharpenPanel, ResidentForm, PlanView, ItemCard, TraceView, ModeBadge
lib/
  qloo/client.ts        transport (HTTP | mock), normaliser, traced QlooService
  qloo/params.ts        supported params per filter.type + sanitiser
  qloo/mock.ts          mock transport
  qloo/fixtures.ts      illustrative fixtures (NOT Qloo data)
  agent/orchestrator.ts plans and runs the Qloo tool calls (incl. readLoved: domain inference for free text)
  agent/composer.ts     week plan + group session composition (Gemini or template)
  agent/gemini.ts       Gemini REST client
  agent/care.ts         era maths, care adaptations, sample residents
  validate.ts           input validation, born/decade/age parsing, "Town, Country" splitting
```

## Licence

MIT. See [LICENSE](./LICENSE). Recommendations powered by [Qloo](https://www.qloo.com/).
