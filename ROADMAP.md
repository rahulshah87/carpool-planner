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
| **Database** | Cloud SQL for PostgreSQL | Structured relational data (users, preferences, matches) |
| **Auth** | Google OAuth 2.0 via Google Identity Services | JWT-based sessions for stateless Cloud Run deployment |
| **Notifications** | Email + push (web push), user-configurable | Users choose which notification channels they want in their preferences |

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────────┐
│  React SPA   │──────▶│  Express (TS)     │──────▶│  Cloud SQL (PG)   │
│  (Vite + TS) │       │  on Cloud Run     │       │                   │
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

## Data Model (v1)

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
| notify_email | boolean | receive email notifications (default true) |
| notify_push | boolean | receive push notifications (default false) |
| push_subscription | jsonb | Web Push subscription object, null if not enrolled |
| created_at | timestamp | |
| updated_at | timestamp | |

### CommutePreference
| Field | Type | Notes |
|---|---|---|
| id | UUID | primary key |
| user_id | FK → User | |
| direction | enum | `TO_WORK` or `FROM_WORK` |
| earliest_time | time | e.g. 07:00 |
| latest_time | time | e.g. 08:30 |
| days_of_week | int[] | 0=Mon … 4=Fri |
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

3. **Detour cost** — Use the Google Maps **Distance Matrix API** (or Directions API) to estimate how many extra minutes a driver would spend picking up the rider:
   - `detour = (driver_home → rider_home → work) − (driver_home → work)`
   - Discard pairs where detour > configurable threshold (default: 15 min).

4. **Rank score** — Simple weighted sum:
   ```
   score = (detour_minutes × W_detour) − (time_overlap_minutes × W_overlap)
   ```
   Lower is better. Weights are tunable app config. This is intentionally naive — good enough to surface useful suggestions without overengineering.

5. **Present top N matches** per user, sorted by score.

### API cost management

- Geocode each address once on save, cache lat/lng.
- Pre-filter candidate pairs by straight-line (haversine) distance before calling the Distance Matrix API. If two homes are > 20 miles apart in opposite directions from work, skip the API call.
- Batch recomputation on a schedule (e.g., nightly) or on-demand when a user updates their profile. Don't recompute on every page load.

---

## Milestones

### Milestone 1 — Project Skeleton & Auth
- [ ] Initialize Express + TypeScript project with Docker + Cloud Run config
- [ ] Initialize React (Vite + TypeScript) frontend
- [ ] Google OAuth sign-in flow (backend validates ID token, issues JWT session)
- [ ] Basic user profile stored in Cloud SQL
- [ ] CI: lint + test on push
- [ ] Deploy to Cloud Run (staging)

### Milestone 2 — User Profile & Address
- [ ] Profile page: display name, email (from Google)
- [ ] Home address input with Google Places Autocomplete
- [ ] Geocode address on save (Google Geocoding API), store lat/lng
- [ ] Commute preferences form: direction, time window, days, driver/rider/either
- [ ] API endpoints: GET/PUT profile, GET/PUT preferences

### Milestone 3 — Matching Engine
- [ ] Implement schedule overlap + role compatibility filtering
- [ ] Haversine pre-filter for candidate pairs
- [ ] Distance Matrix API integration for detour calculation
- [ ] Rank scoring and storage in MatchResult table
- [ ] Batch recomputation trigger (manual endpoint for now)
- [ ] API endpoint: GET /matches (returns ranked list for current user)

### Milestone 4 — Match UI & Contact
- [ ] Matches page showing ranked carpool partners
- [ ] Each match card shows: name, general area, approximate detour, schedule overlap, role
- [ ] "Interested" button that notifies the other user (via their preferred channels)
- [ ] Notification preferences UI: toggle email and/or push notifications
- [ ] Web Push enrollment flow (service worker + subscription)
- [ ] Email notifications via SendGrid (or SES) when someone expresses interest

### Milestone 5 — Polish & Production Deploy
- [ ] App config for workplace destination (name, address, lat/lng) — not hard-coded
- [ ] Environment-based config (dev/staging/prod)
- [ ] Rate limiting and basic abuse prevention
- [ ] Privacy: users see first name + general area only (full details on mutual interest)
- [ ] Production Cloud Run deployment with custom domain
- [ ] Monitoring and alerting (Cloud Logging / Cloud Monitoring)

---

## Future (out of scope for v1)

- **Campus sub-locations** — let users specify a building or parking lot on campus for finer-grained matching
- **Recurring schedule management** — "I work from home on Fridays" patterns
- **In-app messaging** — instead of email-based contact
- **Groups / ongoing carpools** — formalize a carpool group, track who's driving which day
- **Real-time pickup coordination** — "I'm leaving in 10 minutes" notifications
- **Carbon / cost savings dashboard**
- **Multi-workplace support** — one deployment serving multiple companies, each with their own destination config

---

## APIs & Services Required

| Service | Purpose | Pricing notes |
|---|---|---|
| Google OAuth 2.0 | Sign-in | Free |
| Google Maps Geocoding API | Convert address → lat/lng | $5 / 1,000 requests |
| Google Maps Distance Matrix API | Compute detour times | $5 / 1,000 elements |
| Google Places Autocomplete | Address input UX | $2.83 / 1,000 sessions |
| GCP Cloud Run | Host backend + frontend | Pay per use, generous free tier |
| GCP Cloud SQL (PostgreSQL) | Database | ~$7/mo for smallest instance |
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

1. **Google account address** — Google does not expose a user's home address via standard OAuth scopes. Users will enter it manually via the Places Autocomplete widget.

2. **Privacy** — Users see first name + general area for matches. Full contact details revealed on mutual interest.

3. **Notifications** — Both email and web push, user-configurable in preferences.

4. **Tech stack** — Node.js + Express + TypeScript backend, React + Vite + TypeScript frontend.

5. **Auth sessions** — JWT-based, stateless for Cloud Run.

6. **Maps API cost** — Google Maps $200/mo free credit covers this project at <100 users for $0. Alternatives (OpenRouteService, Mapbox, OSRM) available if needed later.
