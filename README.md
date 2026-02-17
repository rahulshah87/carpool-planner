# Carpool Planner

A web app that helps coworkers find carpool partners. Users sign in with Google, enter their home address and commute schedule, and get ranked matches based on route overlap and schedule compatibility.

Built with React + TypeScript (Vite) frontend, Express + TypeScript backend, PostgreSQL (Cloud SQL), and deployed to Google Cloud Run via GitHub Actions.

---

## Local Development

### Prerequisites

- Node.js 20+
- A PostgreSQL database (local or Cloud SQL)
- A Google Cloud project with OAuth 2.0 credentials and a Maps API key

### Setup

```bash
# Install all dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Copy and fill in environment variables
cp .env.example .env
```

Edit `.env` with your local values (see [Environment Variables](#environment-variables) below), then:

```bash
npm run dev        # starts both server (port 3000) and client (port 5173)
npm run build      # production build
npm run start      # run production build locally
```

The client proxies `/api` requests to `http://localhost:3000` in dev mode.

---

## Deploying to GCP

Deployment is fully automated via GitHub Actions on push to `main`/`master`. The workflow:

1. Builds a multi-stage Docker image (React app + Express server)
2. Pushes to Google Artifact Registry
3. Deploys to Cloud Run with environment variables
4. Sets `BASE_URL` to the live Cloud Run service URL

### One-time GCP setup

Before the workflow can run you need:

1. **A GCP project** with these APIs enabled:
   - Cloud Run API
   - Cloud Build API
   - Artifact Registry API
   - Cloud SQL Admin API

2. **A Cloud SQL PostgreSQL instance** — the smallest `db-f1-micro` tier (~$7/mo) is sufficient for small deployments.

3. **A service account** with these IAM roles, for use by GitHub Actions:
   - `roles/run.admin`
   - `roles/iam.serviceAccountUser`
   - `roles/artifactregistry.admin`
   - `roles/cloudsql.client`
   - `roles/storage.admin`

   Export a JSON key for this service account — you'll need it for the `GCP_SA_KEY` secret.

4. **Google OAuth 2.0 credentials** — create an OAuth client ID (Web application type) in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials). After your first deploy, add the Cloud Run service URL to:
   - Authorized JavaScript origins
   - Authorized redirect URIs: `https://<your-service-url>/api/auth/google/callback`

5. **A Google Maps API key** with these APIs enabled:
   - Maps JavaScript API
   - Geocoding API
   - Places API

---

## GitHub Actions Secrets

Go to your repository → **Settings → Secrets and variables → Actions → New repository secret** and add each of the following:

| Secret | Description | How to get it |
|---|---|---|
| `GCP_SA_KEY` | Service account JSON key for GCP authentication | GCP Console → IAM → Service Accounts → your SA → Keys → Add Key → JSON |
| `CLOUDSQL_CONNECTION_NAME` | Cloud SQL instance connection name | GCP Console → Cloud SQL → your instance → Connection name (format: `project-id:region:instance-id`) |
| `DATABASE_URL` | PostgreSQL connection string using Cloud SQL Unix socket | See format below |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID | GCP Console → APIs & Services → Credentials → your OAuth client |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret | Same location as client ID |
| `GOOGLE_MAPS_API_KEY` | Maps API key | GCP Console → APIs & Services → Credentials → your API key |
| `JWT_SECRET` | Random secret for signing session tokens | Generate with: `openssl rand -hex 32` |

### DATABASE_URL format for Cloud SQL

Cloud Run connects to Cloud SQL via a Unix socket (no SSL needed):

```
postgresql://DB_USER:DB_PASSWORD@/DB_NAME?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_ID
```

Example:
```
postgresql://appuser:s3cr3t@/carpooldb?host=/cloudsql/carpool-planner-487718:us-central1:carpool-db
```

> **Note:** The `@` character in the connection string requires `DATABASE_URL` to be set separately from other env vars in the deploy workflow — this is already handled correctly.

---

## Environment Variables

These variables are set automatically in production by the GitHub Actions workflow. For local development, put them in a `.env` file at the repo root.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |
| `GOOGLE_MAPS_API_KEY` | Yes | Maps + Geocoding + Places API key |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `BASE_URL` | Yes (prod) | Full URL of the deployed service, e.g. `https://carpool-planner-xxxx-uc.a.run.app` — set automatically by the deploy workflow |
| `PORT` | No | Server port (default `3000`; Cloud Run sets this to `8080` automatically) |
| `WORKPLACE_NAME` | No | Display name for the destination workplace (default: `Epic Systems`) |
| `WORKPLACE_ADDRESS` | No | Street address of the workplace (default: `1979 Milky Way, Verona, WI 53593`) |
| `WORK_LAT` | No | Workplace latitude (default: `42.9914`) |
| `WORK_LNG` | No | Workplace longitude (default: `-89.5326`) |

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌───────────────────┐
│  React SPA   │──────▶│  Express (TS)     │──────▶│  Cloud SQL        │
│  (Vite + TS) │       │  on Cloud Run     │       │  (PostgreSQL)     │
└──────────────┘       └────────┬─────────┘       └───────────────────┘
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
             Google OAuth  Google Maps   Google Maps
             (sign-in)     Geocoding     Places API
```

The React app is compiled at build time and served as static files from the same Cloud Run container as the Express API. Cloud Run scales to zero when idle.

---

## Project Structure

```
carpool-planner/
├── .github/workflows/
│   └── deploy.yml          # CI/CD: build → push → Cloud Run deploy
├── server/
│   └── src/
│       ├── index.ts         # Express entry point, DB init with retry
│       ├── db.ts            # pg Pool, schema creation
│       ├── auth.ts          # JWT sign/verify, requireAuth middleware
│       └── routes/
│           ├── auth.ts      # Google OAuth flow, /me, /logout
│           ├── profile.ts   # User profile CRUD
│           ├── preferences.ts # Commute preferences CRUD
│           └── matches.ts   # Matching engine, /compute
├── client/
│   └── src/
│       ├── App.tsx
│       ├── context/AuthContext.tsx
│       ├── pages/           # Login, Dashboard, Matches, Profile, Preferences
│       └── components/      # Navbar, MatchCard
├── Dockerfile               # Multi-stage: client build → server build → runtime
└── ROADMAP.md               # Feature roadmap, data model, matching algorithm
```

---

## Matching Algorithm

Matches are computed on demand (POST `/api/matches/compute`) and cached in the database.

1. **Schedule overlap** — pairs with zero time window overlap are discarded
2. **Role compatibility** — at least one person must be willing to drive
3. **Distance pre-filter** — pairs more than 30 miles apart (Haversine) are skipped
4. **Detour estimate** — `(driver → rider → work) − (driver → work)` using Haversine (~2 min/mile); pairs with detour > 15 min are discarded
5. **Rank score** — `(detour_minutes × 1.0) − (time_overlap_minutes × 0.5)`; lower is better

Match cards show neighborhood names only (not full addresses) for privacy.
