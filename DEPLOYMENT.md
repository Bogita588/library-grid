# Deployment

## Architecture

Vercel serves the frontend from `dist`.

Contabo runs the Node backend, PostgreSQL, and the S3/Object Storage integration:

```text
Vercel link
  /dashboard, /library, /auth -> static React frontend
  /api/*                     -> http://207.180.229.65:3001/api/*

Contabo VPS
  Node backend: /opt/pleng-dms, systemd service pleng-dms, port 3001
  PostgreSQL: pleng_dms on 127.0.0.1:5432 only
  Object storage: Contabo S3 bucket a66e070f1ad1463d95eca9e84ee7e7c8:pleng
```

## Local Frontend

Create a local `.env` value if you want local frontend requests to use Contabo:

```env
VITE_API_PROXY_TARGET=http://207.180.229.65:3001
```

Run:

```bash
npm run dev:frontend
```

## Vercel

Vercel uses `vercel.json`:

- Install command: `npm install --package-lock=false`
- Build command: `npm run build:frontend`
- Output directory: `dist`
- `/api/*` rewrites to the Contabo backend
- all other routes serve `/index.html`

Pushes to GitHub trigger Vercel frontend deployments if the GitHub repository is connected to Vercel.

## Contabo Backend

The backend is already running on Contabo:

```bash
systemctl status pleng-dms
systemctl restart pleng-dms
journalctl -u pleng-dms -f
```

PostgreSQL remains private on Contabo:

```text
DATABASE_URL=postgresql://pleng_app:...@127.0.0.1:5432/pleng_dms
```

Do not put `DATABASE_URL` in Vercel.
