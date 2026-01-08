# Dokploy Deployment Guide

## Overview

This guide explains how to deploy the Student Portal application to Dokploy.

**Domain:** `studentportal.elvicsolutions.net`

## Architecture

- **Frontend:** React SPA served by Bun (port 3010)
- **Backend:** Node.js/Express API with Python grading service (port 3001)
- **Database:** PostgreSQL (managed by Dokploy)

## Step 1: Create PostgreSQL Database

1. Go to Dokploy Dashboard → **Services** → **Add Service**
2. Select **PostgreSQL**
3. Configure:
   - **Name:** `studentportal-db`
   - **Database:** `studentportal`
   - **User:** `postgres`
   - **Password:** (choose a strong password)
4. Click **Deploy**

### Restore Database (if migrating)

```bash
# Copy backup to container
docker cp backup.sql <postgres-container-id>:/backup.sql

# Restore
docker exec -it <postgres-container-id> psql -U postgres -d studentportal < /backup.sql
```

## Step 2: Deploy Backend

1. Go to **Applications** → **Add Application**
2. Select **Docker**
3. Configure:
   - **Name:** `studentportal-backend`
   - **Repository:** Your GitHub repo
   - **Branch:** `main`
   - **Dockerfile Path:** `backend/Dockerfile.prod`

4. **Environment Variables:**
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@studentportal-db:5432/studentportal
   JWT_SECRET=your_jwt_secret_here
   PORT=3001
   NODE_ENV=production
   GRADING_SCRIPT_DIR=/app/grading_service
   CORS_ORIGIN=https://studentportal.elvicsolutions.net
   ```

5. **Volumes:**
   - `studentportal-uploads:/app/uploads`
   - `studentportal-grading:/app/grading_service/tests`

6. Click **Deploy**

## Step 3: Deploy Frontend

1. Go to **Applications** → **Add Application**
2. Select **Docker**
3. Configure:
   - **Name:** `studentportal-frontend`
   - **Repository:** Your GitHub repo
   - **Branch:** `main`
   - **Dockerfile Path:** `frontend/Dockerfile.prod`

4. Click **Deploy**

## Step 4: Configure Domain & Routing

### For `studentportal.elvicsolutions.net`:

1. Go to frontend application → **Domains**
2. Add domain: `studentportal.elvicsolutions.net`
3. Configure routing rules in Traefik:

**Method 1: Using Traefik Labels**

Add to backend application:
```yaml
traefik.http.routers.backend.rule=Host(`studentportal.elvicsolutions.net`) && (PathPrefix(`/api`) || PathPrefix(`/uploads`) || PathPrefix(`/grading_service`))
traefik.http.routers.backend.priority=100
```

Add to frontend application:
```yaml
traefik.http.routers.frontend.rule=Host(`studentportal.elvicsolutions.net`)
traefik.http.routers.frontend.priority=1
```

**Method 2: Using Dokploy Domain Settings**

Configure the frontend with the domain, then add path-based routing to forward:
- `/api/*` → backend:3001
- `/uploads/*` → backend:3001
- `/grading_service/*` → backend:3001

4. Enable SSL (Let's Encrypt)
5. Enable HTTP → HTTPS redirect

## Step 5: Verify Deployment

```bash
# Test frontend
curl https://studentportal.elvicsolutions.net/

# Test API health
curl https://studentportal.elvicsolutions.net/api/health

# Test static files
curl https://studentportal.elvicsolutions.net/uploads/tests/example.jpg
```

## Automatic Deployments

Dokploy will automatically rebuild and redeploy when you push to the `main` branch.

The GitHub Actions workflow has been commented out to prevent conflicts.

## Volume Persistence

The following data is persisted across deployments:

- **uploads:** User-uploaded test files and PDFs
- **grading tests:** Graded bubble sheet images and JSON results
- **database:** PostgreSQL data

## Troubleshooting

### Backend can't connect to database
- Verify the `DATABASE_URL` uses the correct service name (e.g., `studentportal-db`)
- Check that the database service is healthy

### Grading service fails
- Ensure Python and required packages are installed (check Dockerfile)
- Verify the grading_service volume is mounted correctly

### Frontend can't reach API
- Verify Traefik routing rules are correct
- Check that backend is accessible at the expected path

### Images not loading
- Check that `/uploads` and `/grading_service` paths are routed to backend
- Verify volume mounts are correct
