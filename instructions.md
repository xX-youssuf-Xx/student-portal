# Dokploy Migration Guide: Bare Metal to Docker Swarm

## Overview

This guide provides step-by-step instructions for migrating a **React Frontend + Node.js Backend + PostgreSQL Database** project from bare metal deployment to **Dokploy** (Docker Swarm orchestration).

**Timeline:** 4-6 hours total
**Complexity:** Intermediate
**Requirements:** Dokploy server with Docker installed, git repository access

---

## Architecture Overview

### Current State (Bare Metal)
- Frontend: React app served via Express/Node on bare metal
- Backend: Node.js/Express API server on bare metal
- Database: PostgreSQL on bare metal
- File Storage: Local filesystem uploads

### Target State (Dokploy)
- Frontend: React SPA in Docker container (Bun server)
- Backend: Node.js/Express in Docker container
- Database: PostgreSQL in Docker container
- File Storage: Docker named volumes (persistent)
- Reverse Proxy: Traefik (automatic HTTPS via Let's Encrypt)
- Networking: Docker Swarm overlay networks

---

## Phase 1: Preparation (30 minutes)

### 1.1 Prerequisites
- [ ] Dokploy server running (https://dokploy.com)
- [ ] Git repository with code pushed
- [ ] SSH access to Dokploy server
- [ ] Domain name configured with DNS pointing to Dokploy server
- [ ] Backup of database and file uploads (essential)

### 1.2 Database Backup
```bash
# On bare metal server
pg_dump -U postgres your_db_name > backup.sql

# Copy to safe location
cp backup.sql /var/backups/
```

### 1.3 File Uploads Backup
```bash
# Backup all uploaded files
tar -czf uploads_backup.tar.gz /path/to/backend/dist/uploads/
cp uploads_backup.tar.gz /var/backups/
```

### 1.4 Environment Variables
Gather all environment variables from bare metal:
```bash
# Backend .env (note: do NOT commit secrets to git)
DATABASE_URL=postgresql://user:pass@host:port/dbname
REDIS_URL=redis://host:port
JWT_SECRET=your_secret_key
CORS_ORIGIN=https://yourdomain.com

# Frontend .env.production
VITE_API_BASE_URL=https://yourdomain.com/api
VITE_API_MEDIA_URL=https://yourdomain.com
```

---

## Phase 2: Dockerization (1.5 hours)

### 2.1 Backend Dockerfile

Create `backend/Dockerfile.prod`:

```dockerfile
# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
RUN bun install --production

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build:prod

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S bunjs && \
    adduser -S bunjs -u 1001

# Copy built artifacts
COPY --from=builder --chown=bunjs:bunjs /app/dist ./dist

# Switch to non-root user
USER bunjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3015/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3015

# Start application
CMD ["bun", "run", "dist/start.js"]
```

**Key Points:**
- Multi-stage build (reduces image size)
- Non-root user (security)
- Health checks (Dokploy monitoring)
- Bun runtime (fast JavaScript runtime)

### 2.2 Frontend Dockerfile (Example)

Create `frontend/Dockerfile.prod`:

```dockerfile
# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json* bun.lockb* ./
RUN bun install

# Copy .env.production (make sure it's NOT in .gitignore)
COPY .env.production .env.production

# Copy source code
COPY . .

# Build the Vite application
RUN bun run tsc && bunx vite build

# Production stage
FROM oven/bun:1-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S bunjs && \
    adduser -S bunjs -u 1001

# Copy built artifacts
COPY --from=builder --chown=bunjs:bunjs /app/dist ./dist

# Copy production server script
COPY --chown=bunjs:bunjs server-prod.ts server.ts

# Switch to non-root user
USER bunjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3010', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3010

# Start server
CMD ["bun", "run", "server.ts"]
```

**Key Points:**
- Vite build for optimization
- .env.production for API URL configuration
- Server script for SPA routing
- Port matches Dokploy configuration

### 2.3 Frontend Server Script

Create `frontend/server-prod.ts`:

```typescript
import { serve } from "bun";

const dist = new URL("./dist/", import.meta.url);

serve({
  port: 3010,
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;
    
    // Don't serve /api or /uploads from frontend
    if (path.startsWith("/api") || path.startsWith("/uploads")) {
      return new Response("Not Found", { status: 404 });
    }
    
    // Remove slashes for file resolution
    const cleanPath = path.replace(/^\/|\/$/g, "");
    const filePath = new URL(cleanPath || "index.html", dist).pathname;
    
    // Check if file exists
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    // Serve index.html for SPA routing
    return new Response(Bun.file(new URL("index.html", dist).pathname));
  },
});

console.log("Frontend running on http://localhost:3010");
```

**Key Points:**
- Rejects `/api` and `/uploads` requests (routes to backend via Traefik)
- Async fetch handler (supports file existence checks)
- SPA routing with index.html fallback

### 2.4 Environment File Configuration

Update `.gitignore` to allow .env.production:

```
# .env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
!.env.production          # ← Allow this file in git
```

Create `frontend/.env.production`:

```
VITE_API_BASE_URL=https://yourdomain.com/api
VITE_API_MEDIA_URL=https://yourdomain.com
VITE_APP_NAME=Your App Name
VITE_DEV_MODE=false
```

---

## Phase 3: Dokploy Configuration (2 hours)

### 3.1 Database Setup

**In Dokploy Dashboard:**

1. Go to **Services** → **Add Service**
2. Select **PostgreSQL** (or **Postgres 15**)
3. Configure:
   - **Name:** `voltx-postgres` (or your project name)
   - **Root Password:** Strong password
   - **Database Name:** `your_db_name`
   - **Username:** `db_user`
   - **Password:** Strong password
4. Click **Deploy**
5. Wait for service to be **healthy** (green status)

**Restore Database (if needed):**

```bash
# Get container ID
docker ps | grep postgres

# Restore from backup
docker cp backup.sql <postgres-container-id>:/
docker exec <postgres-container-id> psql -U db_user -d your_db_name < /backup.sql
```

### 3.2 Redis Setup (Optional)

If your backend uses Redis:

1. Go to **Services** → **Add Service**
2. Select **Redis**
3. Configure:
   - **Name:** `voltx-redis`
   - **Password:** Strong password (optional)
4. Click **Deploy**

### 3.3 Backend Application

**In Dokploy Dashboard:**

1. Go to **Applications** → **Add Application**
2. Select **Docker**
3. Configure:
   - **Name:** `voltx-backend`
   - **Repository:** Your GitHub repo URL
   - **Branch:** `main` (or `production`)
   - **Build Type:** `Dockerfile`
   - **Dockerfile Path:** `backend/Dockerfile.prod`

4. **Environment Variables:**
   - `DATABASE_URL=postgresql://db_user:password@voltx-postgres:5432/your_db_name`
   - `REDIS_URL=redis://voltx-redis:6379`
   - `JWT_SECRET=your_secret_key`
   - `CORS_ORIGIN=https://yourdomain.com`
   - `NODE_ENV=production`

5. **Port Configuration:**
   - Container Port: `3015`
   - Port Mapping: `3015:3015` (internal)

6. **Volumes:**
   - Volume Mount: `voltx-uploads:/app/dist/uploads` (for file persistence)

7. Click **Deploy**

**Upload Initial Files (if any):**

```bash
# From your local machine
docker cp /path/to/uploads/. <backend-container-id>:/app/dist/uploads/
```

### 3.4 Frontend Application

Repeat for each frontend (if multiple):

**In Dokploy Dashboard:**

1. Go to **Applications** → **Add Application**
2. Select **Docker**
3. Configure:
   - **Name:** `voltx-frontend-main`
   - **Repository:** Your GitHub repo URL
   - **Branch:** `main` (or `production`)
   - **Build Type:** `Dockerfile`
   - **Dockerfile Path:** `frontend/Dockerfile.prod`

4. **Port Configuration:**
   - Container Port: `3010`

5. Click **Deploy**

Wait for both applications to be **healthy** before proceeding.

### 3.5 Domain and Routing Configuration

**For main domain (yourdomain.com):**

1. Go to **Domains** (in frontend application)
2. Add Domain: `yourdomain.com`
3. **Routing Rules:**
   
   Create multiple routes in this order:
   
   a) **API Route (highest priority)**
   - **Path:** `/api`
   - **Service:** `voltx-backend`
   - **Port:** `3015`
   - **SSL:** Enabled
   
   b) **Uploads Route**
   - **Path:** `/uploads`
   - **Service:** `voltx-backend`
   - **Port:** `3015`
   - **SSL:** Enabled
   
   c) **Default Route (lowest priority)**
   - **Path:** `/`
   - **Service:** `voltx-frontend-main`
   - **Port:** `3010`
   - **SSL:** Enabled

4. **HTTP → HTTPS Redirect:** Enabled

5. Save and wait for Traefik to reload (~30 seconds)

**Test Routing:**

```bash
# Should serve frontend
curl https://yourdomain.com/

# Should serve API
curl https://yourdomain.com/api/health

# Should serve images
curl https://yourdomain.com/uploads/image-name.webp
```

---

## Phase 4: Database Migration (30 minutes)

### 4.1 Connect to Database

```bash
# Method 1: From Dokploy server
docker exec <postgres-container-id> psql -U db_user -d your_db_name

# Method 2: From local machine (if exposed)
psql -h yourdomain.com -U db_user -d your_db_name
```

### 4.2 Run Migrations

If using migration scripts:

```bash
# Inside backend container
docker exec <backend-container-id> bun run migrations

# Or manually run SQL files
docker exec <postgres-container-id> psql -U db_user -d your_db_name < /app/migrations/001-init.sql
```

### 4.3 Verify Database

```bash
# Check tables
psql -U db_user -d your_db_name -c "\dt"

# Verify data
psql -U db_user -d your_db_name -c "SELECT COUNT(*) FROM users;"
```

---

## Phase 5: Testing & Validation (30 minutes)

### 5.1 Health Checks

```bash
# Backend health
curl https://yourdomain.com/api/health

# Expected response:
# {"status":"healthy","message":"API is running","database":{"status":"connected"}}
```

### 5.2 Frontend Tests

- [ ] Load homepage: https://yourdomain.com
- [ ] Check browser console for errors
- [ ] Test login functionality
- [ ] Test API calls (check Network tab)
- [ ] Verify images load from `/uploads`
- [ ] Test responsive design on mobile

### 5.3 Backend Tests

- [ ] List products: `curl https://yourdomain.com/api/products`
- [ ] Create new item (if applicable)
- [ ] Verify database persistence
- [ ] Check file uploads work
- [ ] Monitor logs for errors

```bash
# View backend logs
docker logs -f <backend-container-id>

# View frontend logs
docker logs -f <frontend-container-id>
```

### 5.4 Performance Check

```bash
# Check image sizes (should be WebP optimized)
curl -I https://yourdomain.com/uploads/image.webp
# Should show Content-Type: image/webp
```

---

## Phase 6: Image Optimization (Optional, 1 hour)

### 6.1 Convert Images to WebP

Create `backend/convert-to-webp.py`:

```python
#!/usr/bin/env python3
import os
from PIL import Image

UPLOADS_DIR = '/app/dist/uploads'
WEBP_QUALITY = 85

for filename in os.listdir(UPLOADS_DIR):
    if filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
        filepath = os.path.join(UPLOADS_DIR, filename)
        img = Image.open(filepath)
        
        # Convert to RGB if needed
        if img.mode in ('RGBA', 'LA'):
            rgb_img = Image.new('RGB', img.size, (255, 255, 255))
            rgb_img.paste(img, mask=img.split()[-1])
            img = rgb_img
        
        output = os.path.splitext(filepath)[0] + '.webp'
        img.save(output, 'WebP', quality=WEBP_QUALITY)
        print(f"✅ {filename} → {os.path.basename(output)}")

print("✅ Conversion complete!")
```

Run conversion:

```bash
docker run --rm \
  -v voltx-uploads:/app/dist/uploads \
  -v /path/to/convert-to-webp.py:/app/convert-to-webp.py \
  python:3.11-slim \
  bash -c "pip install Pillow -q && python3 /app/convert-to-webp.py"
```

### 6.2 Update Database

Update all image URLs to .webp in database:

```sql
BEGIN;

UPDATE media 
SET image_url = regexp_replace(image_url, '\.(jpg|jpeg|png|gif|bmp)$', '.webp', 'i')
WHERE image_url ~* '\.(jpg|jpeg|png|gif|bmp)$';

-- Verify
SELECT COUNT(*) as webp_count FROM media WHERE image_url LIKE '%.webp';

COMMIT;
```

---

## Phase 7: Monitoring & Maintenance

### 7.1 Enable Monitoring

In Dokploy:
- Set up **Health Checks** for all applications
- Configure **Restart Policies** (always, unless stopped)
- Set up **Notifications** for failures (optional)

### 7.2 Regular Backups

```bash
# Automated database backup (daily)
docker exec <postgres-container-id> pg_dump -U db_user your_db_name > /backups/db_$(date +%Y%m%d).sql

# Backup volumes
docker run --rm -v voltx-uploads:/data -v /backups:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

### 7.3 Log Monitoring

```bash
# Check all application logs
docker logs -f <backend-container-id>
docker logs -f <frontend-container-id>
docker logs -f <postgres-container-id>
```

### 7.4 Uptime Monitoring

- Use external monitoring (UptimeRobot, Pingdom)
- Monitor `/api/health` endpoint
- Set up alerts for downtime

---

## Troubleshooting Guide

### Issue: Frontend shows "Cannot GET /"

**Solution:** Check that Traefik is routing requests to frontend correctly.

```bash
# Test direct connection
docker exec <frontend-container-id> curl http://localhost:3010/

# Check Traefik logs
docker logs dokploy-traefik | tail -20
```

### Issue: API requests fail with 502 Bad Gateway

**Solution:** Backend may not be healthy or port routing is wrong.

```bash
# Test backend directly
docker exec <backend-container-id> curl http://localhost:3015/api/health

# Check backend logs
docker logs -f <backend-container-id>

# Verify environment variables
docker inspect <backend-container-id> | grep -A 20 "Env"
```

### Issue: Database connection fails

**Solution:** Check connection string and database readiness.

```bash
# Check if database is running
docker ps | grep postgres

# Test connection
docker exec <postgres-container-id> psql -U db_user -d your_db_name -c "SELECT 1"

# Verify connection string format
# Should be: postgresql://user:password@host:port/dbname
```

### Issue: Images return 404

**Solution:** Check volume mount and file permissions.

```bash
# Verify files exist in volume
docker exec <backend-container-id> ls -la /app/dist/uploads/ | head -20

# Check file permissions
docker exec <backend-container-id> stat /app/dist/uploads/image.webp

# Test via curl
docker exec <backend-container-id> curl http://localhost:3015/uploads/image.webp
```

### Issue: SSL certificate not working

**Solution:** Ensure domain DNS is pointing to Dokploy server.

```bash
# Check DNS resolution
nslookup yourdomain.com
dig yourdomain.com

# Test HTTP/HTTPS
curl -I http://yourdomain.com/
curl -I https://yourdomain.com/

# Check Traefik certificates
docker exec dokploy-traefik ls -la /data/letsencrypt/
```

---

## Rollback Plan

If issues occur:

### 1. Stop New Services

```bash
docker-compose down
# or in Dokploy UI: stop the applications
```

### 2. Restore from Backup

```bash
# Restore database
psql -U db_user -d your_db_name < backup.sql

# Restore uploads
tar -xzf uploads_backup.tar.gz -C /var/lib/docker/volumes/voltx-uploads/_data
```

### 3. Redirect Traffic Back to Bare Metal

- Update DNS A record to point to old server
- Or keep Dokploy running and revert application code

---

## Performance Optimization Tips

1. **Enable Caching:**
   - Static files: 1 year cache for /assets
   - API responses: 5 min cache where applicable

2. **Database Optimization:**
   - Add indexes on frequently queried columns
   - Use connection pooling (PgBouncer)

3. **Image Optimization:**
   - Convert all images to WebP
   - Use appropriate quality settings (80-85%)
   - Add lazy loading to frontend

4. **Monitor Resources:**
   - Check CPU/Memory usage in Dokploy
   - Scale services if needed
   - Monitor network bandwidth

---

## Summary Checklist

- [ ] Backups created and tested
- [ ] Docker images built and tested locally
- [ ] Dokploy server prepared
- [ ] PostgreSQL database deployed and healthy
- [ ] Backend application deployed and healthy
- [ ] Frontend application deployed and healthy
- [ ] Domain configured with DNS
- [ ] Traefik routing rules configured
- [ ] SSL certificates generated
- [ ] Database migrated and verified
- [ ] All endpoints tested
- [ ] Health checks verified
- [ ] Monitoring set up
- [ ] Backup strategy implemented

---

## Reference: Key Port Mappings

| Service | Container Port | External Port | Purpose |
|---------|----------------|---------------|---------|
| Backend | 3015 | 3015 | API, Internal |
| Frontend | 3010 | 3010 | SPA, Internal |
| PostgreSQL | 5432 | 5432 | Database, Internal |
| Redis | 6379 | 6379 | Cache, Internal |
| Traefik | 80, 443 | 80, 443 | Web, External |

---

## Support & Resources

- [Dokploy Documentation](https://dokploy.com/docs)
- [Docker Documentation](https://docs.docker.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)

---

**Last Updated:** January 7, 2026
**Version:** 1.0
**Estimated Total Time:** 4-6 hours
