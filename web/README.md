# Wedding Marketing Intelligence

An AI-powered creative director, photo editor, and social media manager for
luxury wedding planners, stylists, decorators, and photographers — built as
a Next.js/Prisma/PostgreSQL app per the platform build brief.

Seeded example account: **Bali Eve Wedding Planner**, a luxury destination
wedding studio in Bali, Indonesia (see `prisma/seed.ts`).

## Architecture

- **Frontend/Backend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS.
  Mutations are Server Actions; the photo upload/analysis endpoints (which
  need streaming file bodies and background-style batch work) are Route
  Handlers under `src/app/api`.
- **Database:** PostgreSQL + Prisma (`prisma/schema.prisma`). 16 models
  covering identity/tenancy, brand, weddings, photos + AI analysis,
  competitor intelligence, the content pipeline, and analytics — see
  §"Data model" below.
- **Auth:** NextAuth (Credentials provider + bcrypt, JWT sessions) instead
  of live Supabase Auth. This was a deliberate MVP choice: it gives a fully
  working, self-contained signup/login flow without needing a Supabase
  project's URL/keys, while producing the same session/org shape Supabase
  Auth would — swapping providers later doesn't require a data-model
  change. See `src/lib/auth.ts`.
- **Storage:** a small `StorageAdapter` interface (`src/lib/storage`) with a
  local-disk implementation (writes to `public/uploads`, the default) and
  an S3-compatible implementation (works with real S3 or Supabase Storage)
  selected via `STORAGE_DRIVER=s3`.
- **AI:** an `AIProvider`-style interface (`src/lib/ai`) with two
  implementations:
  - **OpenAI** (`openai-provider.ts`) — real GPT-4o-mini vision calls for
    photo scoring, real chat completions for captions/opportunities. Used
    whenever `OPENAI_API_KEY` is set. Throws on failure rather than
    silently falling back — no fabricated "success".
  - **Demo Mode** (`demo-provider.ts`) — used whenever no key is
    configured. Technical and composition scores come from **real pixel
    measurements** via Sharp (Laplacian-variance sharpness, brightness/
    contrast histograms, rule-of-thirds grid energy, line-orientation
    detection for architecture) — see `image-metrics.ts`. Editorial/
    emotional scoring and object/people detection genuinely require a
    vision-language model, so those are conservatively approximated
    (editorial) or left unset (detection) rather than faked, and every
    result is tagged `provider: "demo-mode"` so the UI can disclose it.
    Captions/hashtags/opportunities fall back to brand-aware
    template/rule-based generation.
- **Image processing:** Sharp — thumbnailing, EXIF auto-rotate, the Demo
  Mode heuristics above.
- **Cloud photo import:** a `CloudProviderAdapter` interface
  (`src/lib/cloud`) with real Google Drive and Dropbox implementations —
  genuine OAuth2 authorization-code flows (never a Google/Dropbox
  username or password touches this app), real Drive v3 / Dropbox API v2
  calls to browse folders and download images. Access/refresh tokens are
  AES-256-GCM encrypted at rest (`src/lib/crypto.ts`) and never sent to the
  client. Gated on `GOOGLE_DRIVE_CLIENT_ID/SECRET` and
  `DROPBOX_APP_KEY/SECRET` — a tab shows "not configured" rather than
  pretending to connect when they're unset. Device upload, Google Drive,
  and Dropbox all funnel through one `PhotoImportJob`-tracked pipeline
  (`src/lib/import-pipeline.ts`) that auto-triggers AI curation the moment
  import finishes — no second manual click — and the client polls that job
  through Importing → Analyzing → Completed, landing on AI Curation
  automatically.
- **Rate limiting:** in-memory per-key limiter (`src/lib/rate-limit.ts`) on
  login, signup, upload, cloud-folder-listing, and analysis endpoints. Good
  enough for a single-instance MVP; swap for Redis/Upstash before scaling
  horizontally.

Everything above is behind an interface specifically so services can be
replaced later without touching call sites (§19 of the brief).

## Data model

`User, Organization, OrganizationMember, Brand, Wedding, Vendor, Photo,
PhotoAnalysis, Competitor, CompetitorPost, ContentIdea, ContentPost,
ContentPostImage, HashtagSet, Analytics, AIRecommendation, CloudConnection,
PhotoImportJob`. Every wedding-scoped or org-scoped table carries
`organizationId` (directly, or transitively via
`weddingId -> Wedding.organizationId`) — see `src/lib/db-scope.ts` for the
enforcement helpers used by every server action/route.

## Cloud photo import

Photo Library's "Add photos" is three tabs — **this device**, **Google
Drive**, **Dropbox** — instead of upload-only. Each cloud tab offers two
ways in:

- **Drop a link** (the easy path — no OAuth consent screen). Paste a
  folder link shared as "Anyone with the link" and import starts
  immediately. Needs only `GOOGLE_DRIVE_API_KEY` (a plain API key — a
  2-minute Google Cloud Console setup, no OAuth client) and/or
  `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/`DROPBOX_REFRESH_TOKEN` (one
  admin runs `scripts/get_dropbox_refresh_token.py`, already in this repo,
  once). See `.env.example` for exact steps.
- **Connect an account** — a real OAuth2 flow (their sign-in screen, never
  a password typed into this app) that also reaches private folders, via
  `GOOGLE_DRIVE_CLIENT_ID/SECRET` or a Dropbox OAuth app. An HMAC-signed
  `state` + an `httpOnly` nonce cookie guard the callback against
  CSRF/replay — see `src/app/api/integrations/[provider]/`. Once
  connected, that same connection is what "drop a link" prefers, reaching
  private folders too.

Either way: selecting a folder (or hitting **Import** on a pasted link) is
itself the trigger — no follow-up confirmation step — and:

1. The wedding's own **concept, color palette, design keywords, couple
   story, and vendor team** are passed into the AI scoring as first-class
   context (`WeddingContext` in `src/lib/ai/types.ts`) — weighted *above*
   the org's general Brand voice, since it's more specific to this shoot.
   Demo Mode's brand-fit score blends the wedding's palette in directly;
   the OpenAI prompt is told explicitly to weigh this wedding's direction
   first.
2. The UI polls the import job through **Importing → Analyzing →
   Completed** and lands on AI Curation automatically with Keep/Maybe/Skip
   already scored — device uploads now auto-trigger curation the same way
   (the old "Run AI Curation" button is still there as a manual fallback,
   e.g. for retrying photos that failed analysis).

With none of the above env vars set, a tab plainly says "not configured"
rather than pretending to work.

## Product principle

Competitor Intelligence is reference-only: accounts are added manually
(screenshot upload, URL, or a pasted note — **no scraping**, per §9), and
its output feeds the pattern-analysis dashboard (categories, caption
structure, hashtag/CTA/posting patterns) that the AI Copywriter may draw
*structural* inspiration from. It is explicitly instructed never to reuse
or closely paraphrase competitor wording — the Brand Settings page is the
source of truth for voice, and every generated caption is original to it.

## Local development

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Database.** Point `DATABASE_URL` in `.env` (copy from `.env.example`)
   at a Postgres instance — a local one, or Supabase Postgres. Then:
   ```bash
   npx prisma migrate dev
   npm run db:seed   # creates the Bali Eve demo account
   ```
3. **Run**
   ```bash
   npm run dev
   ```
   Sign in with the seeded demo account (see seed script output), or
   create your own studio account from `/signup`.

### Environment variables

See `.env.example` for the full list and explanations. Nothing is required
beyond `DATABASE_URL` and `NEXTAUTH_SECRET` to run the app in Demo Mode.
`OPENAI_API_KEY` upgrades photo scoring/copywriting to live model calls;
`STORAGE_DRIVER=s3` + `S3_*` point uploads at real object storage instead
of local disk.

## What's implemented

**Phase 1** — auth, luxury dashboard shell + nav, Wedding Projects CRUD,
batch photo upload, Photo Library grid, AI photo analysis pipeline
(technical/composition/editorial/brand-fit scoring, KEEP/MAYBE/REJECT
verdicts with rationale, category classification), top-10 curation view,
full manual override on every AI decision.

**Phase 2** — Brand Settings, Competitor Intelligence (manual reference
library + pattern-analysis dashboard), Content Opportunity Engine
(unused-photo detection → post concepts), AI Copywriter (8 tones, original
captions/hooks/CTAs/SEO keywords/hashtags).

**Phase 3** — vendor database + rule-based tag/collaboration
recommendations, hashtag engine, Content Calendar (IDEA → PUBLISHED
statuses), posting-time recommender (honest about data availability — see
`src/lib/posting-time.ts`).

**Phase 4 (lightweight)** — manual-entry Analytics with real breakdowns
(no fabricated numbers; patterns only surface once there's enough sample
size), and an AI Marketing Director chat grounded in the account's actual
weddings/photos/content data (`src/lib/director.ts`), with a fixed,
data-backed question set in Demo Mode and open-ended (still grounded)
Q&A once `OPENAI_API_KEY` is set. Social platform integrations are not
implemented — there's no Instagram/Meta API connection in this MVP.

## Known follow-ups before a production launch

- `npm audit` flags vulnerabilities in `next@14`, `next-auth@4`, and
  `eslint-config-next@14`/their transitive deps; fixing them means major
  version bumps (Next 16, Auth.js 5) that need their own migration pass
  rather than a same-session swap.
- Batch photo analysis and cloud folder imports run as a detached
  fire-and-forget promise on the same Node process rather than a real job
  queue (fine for an MVP-sized batch on a persistent server; move to
  BullMQ/Inngest for larger libraries or a serverless deployment, where the
  process can be frozen/killed after the response returns).
- Cloud OAuth flows and the "drop a link" API-key/refresh-token paths
  (Google Drive, Dropbox) are implemented for real but untested against
  live provider credentials in this environment — none were available
  here. Code-reviewed against both providers' current OAuth2 + API docs;
  verify end-to-end once real `GOOGLE_DRIVE_API_KEY` (or
  `GOOGLE_DRIVE_CLIENT_ID/SECRET`) / `DROPBOX_APP_KEY/SECRET` (+
  `DROPBOX_REFRESH_TOKEN` for link import) are set.
- No real Instagram/Meta Graph API integration — Analytics is manual-entry
  only, and the posting-time engine says so explicitly rather than
  guessing.
