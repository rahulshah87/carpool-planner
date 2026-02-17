# Carpool Planner — Roadmap

## Overview

A web application that helps coworkers find carpool partners for commuting to a shared workplace. Users sign in with Google, enter their home address and commute preferences, and the system suggests ranked matches based on route overlap and schedule compatibility.

The initial deployment targets carpooling to **Epic's Verona, WI campus**, but the work destination is app-level configuration so any workplace can use it. 

---

## Design Decisions

| Decision | Choice | Notes |
|---|---|---|
| **Maps / Routing API** | Google Maps Platform (Directions, Distance Matrix, Geocoding) | $200/mo free credit covers this project's scale comfortably — see cost analysis below |
| **Backend** | Node.js (Express) with TypeScript | Deployed as a Docker container on Cloud Run |
| **Frontend** | React (Vite) with TypeScript | SPA served from the same Cloud Run container or a CDN bucket |
| **Database** | SQLite (better-sqlite3) for dev/small scale; Cloud SQL for PostgreSQL at scale | Structured relational data (users, preferences, matches) |
| **Auth** | Google OAuth 2.0 via Google Identity Services | JWT-based sessions for stateless Cloud Run deployment |
| **Notifications** | Email + push (web push), user-configurable | Users choose which notification channels they want in their preferences |
| **Theme** | Dark mode with vibrant purple/coral/emerald palette | Modern feel, easier on eyes for daily use |

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────────┐
│  React SPA   │──────▶│  Express (TS)     │──────▶│  SQLite / Cloud   │
│  (Vite + TS) │       │  on Cloud Run     │       │  SQL (PG)         │
└──────────────┘       └────────┬─────────┘       └───────────────────┘
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
             Google OAuth  Google Maps   Web Push /
             (sign-in)     Platform      Email (SendGrid
                           APIs          or SES)
```

All components run on GCP. The Express service is containerized and deployed to **Cloud Run**. Static frontend assets can be served from the same container or from a Cloud Storage bucket behind a CDN — either works for v1.

---

## Data Model

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| google_id | string | from OAuth, unique |
| email | string | Gmail address |
| display_name | string | from Google profile |
| home_address | string | free-text, geocoded on save |
| home_lat | float | geocoded latitude |
| home_lng | float | geocoded longitude |
| home_neighborhood | string | extracted from Google Geocoding address_components (neighborhood > sublocality > locality) |
| notify_email | boolean | receive email notifications (default true) — *not yet implemented* |
| notify_push | boolean | receive push notifications (default false) — *not yet implemented* |
| push_subscription | jsonb | Web Push subscription object, null if not enrolled — *not yet implemented* |
| created_at | timestamp | |
| updated_at | timestamp | |

### CommutePreference
| Field | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| user_id | FK → User | |
| direction | enum | `TO_WORK` or `FROM_WORK` |
| earliest_time | time | e.g. 07:00 (to work) or 17:00 (from work) |
| latest_time | time | must be after earliest_time (validated client + server) |
| days_of_week | int[] | 0=Mon … 4=Fri; at least one required |
| role | enum | `DRIVER`, `RIDER`, `EITHER` |

### MatchResult (computed, cached)
| Field | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| user_a_id | FK → User | |
| user_b_id | FK → User | |
| direction | enum | `TO_WORK` or `FROM_WORK` |
| detour_minutes | float | extra drive time for pickup |
| time_overlap_minutes | float | overlap of schedule windows |
| rank_score | float | combined score (lower = better) |
| computed_at | timestamp | when this match was calculated |

---

## Matching Algorithm (v1 — keep it simple)

The goal is to find pairs of users whose routes overlap enough that one could pick up the other without too much detour, and whose schedules are compatible.

### Steps

1. **Schedule overlap** — For each pair of users going the same direction, compute the overlap between their time windows. Discard pairs with zero overlap.

2. **Role compatibility** — At least one must be willing to drive (`DRIVER` or `EITHER`). If both are `RIDER`, skip.

3. **Detour cost** — Currently uses **Haversine distance approximation** (1 mile ≈ 2 min suburban driving). Future: integrate Google Maps Distance Matrix API for real drive times.
   - `detour = (driver_home → rider_home → work) − (driver_home → work)`
   - Discard pairs where detour > configurable threshold (default: 15 min).

4. **Rank score** — Simple weighted sum:
   ```
   score = (detour_minutes × W_detour) − (time_overlap_minutes × W_overlap)
   ```
   Lower is better. Weights are tunable app config. This is intentionally naive — good enough to surface useful suggestions without overengineering.

5. **Present top N matches** per user, sorted by score.

### API cost management

- Geocode each address once on save, cache lat/lng + neighborhood.
- Pre-filter candidate pairs by straight-line (haversine) distance before calling the Distance Matrix API. If two homes are > 20 miles apart in opposite directions from work, skip the API call.
- Batch recomputation on a schedule (e.g., nightly) or on-demand when a user updates their profile. Don't recompute on every page load.

---

## Milestones

### Milestone 1 — Project Skeleton & Auth ✅
- [x] Initialize Express + TypeScript project with Docker config
- [x] Initialize React (Vite + TypeScript) frontend
- [x] Google OAuth sign-in flow (backend validates ID token, issues JWT session)
- [x] Basic user profile stored in SQLite
- [x] Dockerfile and Cloud Run deploy workflow
- [ ] CI: lint + test on push *(see Testing section below)*

### Milestone 2 — User Profile & Address ✅
- [x] Profile page: display name, email (from Google)
- [x] Home address input with Google Places Autocomplete (classic API, with manual text input fallback)
- [x] Geocode address on save (Google Geocoding API), store lat/lng + neighborhood
- [x] Commute preferences form: direction, time window, days, driver/rider/either
- [x] Direction-specific defaults (to work: 7–8:30 AM, from work: 5–6:30 PM)
- [x] Client + server-side validation (time ordering, at least one day)
- [x] API endpoints: GET/PUT profile, GET/PUT/DELETE preferences

### Milestone 3 — Matching Engine ✅
- [x] Implement schedule overlap + role compatibility filtering
- [x] Haversine pre-filter for candidate pairs (< 30 mi)
- [x] Haversine-based detour estimation (< 15 min threshold)
- [x] Rank scoring and storage in MatchResult table
- [x] Manual recomputation trigger (POST /matches/compute)
- [x] API endpoint: GET /matches (returns ranked list for current user)
- [ ] Upgrade to Google Distance Matrix API for real drive times

### Milestone 4 — Match UI & Dashboard *(in progress)*
- [x] Matches page showing ranked carpool partners
- [x] Match cards show: name, neighborhood, detour, schedule overlap, direction
- [x] Dashboard with setup checklist (tracks address + schedule completion)
- [x] Dashboard schedule summary (shows saved commute windows inline)
- [x] Dark mode with vibrant purple/coral/emerald color scheme
- [ ] "Interested" button that notifies the other user
- [ ] Notification preferences UI: toggle email and/or push notifications
- [ ] Web Push enrollment flow (service worker + subscription)
- [ ] Email notifications via SendGrid (or SES) when someone expresses interest

### Milestone 5 — Polish & Production Deploy
- [x] App config for workplace destination (name, address, lat/lng) via env vars
- [ ] Environment-based config (dev/staging/prod)
- [ ] Rate limiting and basic abuse prevention
- [x] Privacy: match cards show neighborhood only (from Google geocoding, not address parsing)
- [ ] Production Cloud Run deployment with custom domain
- [ ] Monitoring and alerting (Cloud Logging / Cloud Monitoring)

---

## Testing Strategy

The project currently has **no test infrastructure**. The goal is to reach **90%+ code coverage** enforced on every commit/merge.

### Framework Choices

| Layer | Framework | Why |
|---|---|---|
| **Server unit/integration** | Vitest | Fast, native TypeScript/ESM, same config style as frontend |
| **Client unit/component** | Vitest + React Testing Library | Vitest integrates with Vite config; RTL for component rendering |
| **API integration** | Supertest | HTTP-level tests against Express routes without starting the server |
| **Coverage** | v8 (via Vitest) | Built-in, fast, accurate for TypeScript |
| **CI enforcement** | GitHub Actions | Run tests + coverage check on every push and PR |

### What to Test

**Server (target: 95%+ coverage)**

| Area | Tests | Priority |
|---|---|---|
| `routes/auth.ts` | OAuth callback flow, JWT issuance, /me endpoint, logout | High |
| `routes/profile.ts` | Address save, geocoding integration (mocked), neighborhood extraction | High |
| `routes/preferences.ts` | CRUD operations, all validation paths (bad times, empty days, invalid role/direction) | High |
| `routes/matches.ts` | GET matches (sanitization, neighborhood), compute matches (overlap, detour, role compat, thresholds) | High |
| `auth.ts` | Token sign/verify, requireAuth middleware (valid, expired, missing) | Medium |
| `db.ts` | Schema creation, migration (home_neighborhood column) | Medium |
| Matching helpers | `haversine()`, `timeToMinutes()`, `computeOverlap()`, `rolesCompatible()` | High |

**Client (target: 85%+ coverage)**

| Area | Tests | Priority |
|---|---|---|
| `Dashboard.tsx` | Renders schedule summary when prefs exist, checklist states, links | High |
| `Preferences.tsx` | Default values per direction, validation errors, day/role toggling, save flow | High |
| `Profile.tsx` | Address input, save button disabled/enabled states, save success/error | High |
| `Matches.tsx` | Empty state, match list rendering, compute trigger | Medium |
| `MatchCard.tsx` | Renders all props, neighborhood display, direction labels | Medium |
| `AuthContext.tsx` | Provider behavior, refreshUser, logout | Medium |
| `Navbar.tsx` | Active link state, user info display | Low |

### CI Pipeline

```yaml
# .github/workflows/ci.yml
# Runs on every push and pull request
# 1. Install dependencies (client + server)
# 2. Lint (TypeScript strict + ESLint)
# 3. Run server tests with coverage (fail if < 90%)
# 4. Run client tests with coverage (fail if < 85%)
# 5. Build client + server (catch compile errors)
```

### Coverage Enforcement

- Server: **90% line coverage minimum**, fail CI if below
- Client: **85% line coverage minimum** (lower because some code is UI/integration that's better tested E2E)
- Combined target: **90%+**
- Coverage reports uploaded as CI artifacts for review

---

## Future (out of scope for v1)

- **Distance Matrix API upgrade** — replace Haversine detour approximation with real Google Maps drive times
- **Campus sub-locations** — let users specify a building or parking lot on campus for finer-grained matching
- **Recurring schedule management** — "I work from home on Fridays" patterns
- **In-app messaging** — instead of email-based contact
- **Groups / ongoing carpools** — formalize a carpool group, track who's driving which day
- **Real-time pickup coordination** — "I'm leaving in 10 minutes" notifications
- **Carbon / cost savings dashboard**
- **Multi-workplace support** — one deployment serving multiple companies, each with their own destination config
- **E2E tests** — Playwright for full user flows (sign in → set address → set schedule → find matches)

---

## APIs & Services Required

| Service | Purpose | Pricing notes |
|---|---|---|
| Google OAuth 2.0 | Sign-in | Free |
| Google Maps Geocoding API | Convert address → lat/lng + neighborhood | $5 / 1,000 requests |
| Google Maps Distance Matrix API | Compute detour times *(future)* | $5 / 1,000 elements |
| Google Places Autocomplete | Address input UX (classic API with text input) | $2.83 / 1,000 sessions |
| GCP Cloud Run | Host backend + frontend | Pay per use, generous free tier |
| GCP Cloud SQL (PostgreSQL) | Production database (SQLite for dev) | ~$7/mo for smallest instance |
| SendGrid (or AWS SES) | Email notifications | Free tier: 100 emails/day (SendGrid) |
| Web Push (VAPID) | Push notifications | Free (browser-native, no third-party cost) |

### Cost analysis for <100 users

Google Maps Platform provides **$200/month in free credit** to every billing account. Estimated monthly usage:

| API | Estimated calls/month | Cost before credit |
|---|---|---|
| Geocoding | ~10 (one-time per new user, cached) | ~$0.05 |
| Distance Matrix | ~15,000 (nightly batch, haversine pre-filtered) | ~$75 |
| Places Autocomplete | ~100 sessions | ~$0.28 |
| **Total** | | **~$75 → $0 after free credit** |

At this scale the project runs at **$0/month for Maps APIs**. The $200 credit would support roughly 250+ active users before any charges appear. Cloud SQL (~$7/mo) is the main fixed cost.

### If you ever want to drop Google Maps costs to zero

- **OpenRouteService**: free hosted API (40 req/min, 2,000/day) — enough for <200 users with nightly batching
- **Mapbox**: 100,000 free API calls/month
- **OSRM (self-hosted)**: run in a Docker sidecar, zero API cost, ~1-2 GB RAM for Wisconsin region data

Swapping is straightforward since all Maps API calls are isolated in the matching service.

---

## Resolved Questions

1. **Google account address** — Google does not expose a user's home address via standard OAuth scopes. Users enter it manually via a text input enhanced with the classic Places Autocomplete API. Server geocodes on save.

2. **Privacy** — Match cards show neighborhood name only (extracted from Google Geocoding `address_components`, not parsed from address string). Full contact details revealed on mutual interest.

3. **Notifications** — Both email and web push, user-configurable in preferences. *(Not yet implemented.)*

4. **Tech stack** — Node.js + Express + TypeScript backend, React + Vite + TypeScript frontend.

5. **Auth sessions** — JWT-based, stateless for Cloud Run.

6. **Maps API cost** — Google Maps $200/mo free credit covers this project at <100 users for $0. Alternatives (OpenRouteService, Mapbox, OSRM) available if needed later.

7. **Dark mode** — Chose a vibrant dark palette (navy bg, purple primary, coral/emerald accents) over light mode for a modern feel.
