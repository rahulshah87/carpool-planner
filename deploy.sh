#!/bin/bash
set -e

# Configuration
PROJECT_ID="carpool-planner-487718"
REGION="us-central1"
SERVICE_NAME="carpool-planner"

# Load secrets from .env file (not committed to git)
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "ERROR: .env file not found. Create one with:"
  echo "  GOOGLE_CLIENT_ID=..."
  echo "  GOOGLE_CLIENT_SECRET=..."
  echo "  GOOGLE_MAPS_API_KEY=..."
  exit 1
fi

# Validate required env vars
for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_MAPS_API_KEY; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var not set in .env"
    exit 1
  fi
done

echo "=== Deploying Carpool Planner to Cloud Run ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Set project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Deploy from source (Cloud Build builds the Dockerfile automatically)
echo "Deploying to Cloud Run (this will take a few minutes)..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" \
  --set-env-vars "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET" \
  --set-env-vars "GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY" \
  --set-env-vars "JWT_SECRET=$(openssl rand -hex 32)" \
  --set-env-vars "WORKPLACE_NAME=Epic Systems" \
  --set-env-vars "WORKPLACE_ADDRESS=1979 Milky Way, Verona, WI 53593" \
  --set-env-vars "WORK_LAT=42.9914" \
  --set-env-vars "WORK_LNG=-89.5326" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

# Update BASE_URL env var with the actual Cloud Run URL
echo ""
echo "Updating BASE_URL with service URL..."
gcloud run services update $SERVICE_NAME \
  --region $REGION \
  --set-env-vars "BASE_URL=$SERVICE_URL"

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "=== IMPORTANT: Update your Google OAuth credentials ==="
echo "Go to: https://console.cloud.google.com/apis/credentials"
echo "Edit your OAuth 2.0 Client ID and add:"
echo ""
echo "  Authorized JavaScript origins:"
echo "    $SERVICE_URL"
echo ""
echo "  Authorized redirect URIs:"
echo "    ${SERVICE_URL}/api/auth/google/callback"
echo ""
echo "After updating, Google OAuth sign-in will work."
