# TrishulHub Dashboard

A comprehensive project management and team collaboration dashboard built with Next.js 16, React 19, Prisma, and SQLite.

## Features

- **Project Management** — Organize projects with tasks, deadlines, and team collaboration
- **CRM Integration** — Client relationship management with contact tracking
- **Finance Dashboard** — Revenue tracking, billing, and financial analytics
- **Team Management** — Role-based access control (Super Admin, Admin, Developer, Client)
- **Time Tracking** — Track work hours, attendance, and availability
- **Approval Workflow** — Request and approval system for tasks, leaves, and more
- **Authentication** — NextAuth.js with credentials-based login and role-based access

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** SQLite (via Prisma)
- **Auth:** NextAuth.js v4
- **Charts:** Recharts
- **Animations:** Framer Motion
- **State:** Zustand, TanStack React Query
- **Forms:** React Hook Form + Zod validation

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/trishulhub-svg/trishulhub-dashboard.git
cd trishulhub-dashboard

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Create database schema
npx prisma db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **"Seed Database"** on the login page to create the default admin user.

### Default Login (after seeding)

- **Email:** taroon@trishulhub.in
- **Password:** password123

> Change these credentials immediately after first login in production.

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | SQLite database path | `file:./db/custom.db` |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Secret for NextAuth JWT signing | A random 32+ char string |
| `HOSTNAME` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `3000` |

---

## Hostinger Deployment (Step-by-Step)

This guide covers deploying on **Hostinger Business Web Hosting** with Node.js support.

### Step 1: Access Your Hostinger Account

1. Log into [Hostinger hPanel](https://hpanel.hostinger.com)
2. Go to **Advanced → Node.js** (or search "Node.js" in hPanel)
3. If you don't see Node.js option, your plan may not support it — upgrade to **Business Web Hosting** or use a **VPS**

### Step 2: Create the Node.js Application

1. In **Node.js** section, click **Create Application**
2. Fill in:
   - **Node.js version:** 18.x or 20.x (choose the latest available)
   - **Application mode:** Production
   - **Application root:** `trishulhub-dashboard` (or your preferred folder name)
   - **Application URL:** Your domain or subdomain
   - **Application startup file:** `app.js`

3. Click **Create**

### Step 3: Upload the Code

**Option A: Via SSH (Recommended)**

1. Enable SSH in hPanel → **Advanced → SSH Access**
2. Connect via SSH:
   ```bash
   ssh u123456789@your-server.hostinger.com
   ```
3. Navigate to the application root:
   ```bash
   cd ~/domains/yourdomain.com/trishulhub-dashboard
   ```
4. Clone the repository:
   ```bash
   git clone https://github.com/trishulhub-svg/trishulhub-dashboard.git .
   ```

**Option B: Via File Manager**

1. Download the repo as ZIP from GitHub
2. Upload and extract to the application root folder in hPanel → **File Manager**

### Step 4: Run Setup Script

Connect via SSH and run:

```bash
cd ~/domains/yourdomain.com/trishulhub-dashboard
bash hostinger-setup.sh
```

This will automatically:
- Install npm dependencies
- Create `.env` file from `.env.example`
- Create the database directory
- Generate Prisma client
- Create database schema (`prisma db push`)
- Build the Next.js application (`npm run build`)

**If the setup script fails**, run the steps manually:

```bash
cd ~/domains/yourdomain.com/trishulhub-dashboard

npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run build
```

### Step 5: Configure Environment Variables

Edit the `.env` file:

```bash
nano .env
```

Update these values:

```env
DATABASE_URL=file:./db/custom.db
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=generate-a-random-32-char-string-here
HOSTNAME=0.0.0.0
PORT=3000
```

To generate a strong `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### Step 6: Configure Node.js App in hPanel

1. Go back to hPanel → **Node.js**
2. Click **Edit** on your application
3. Set:
   - **Application startup file:** `app.js`
   - **Application mode:** Production
4. Add environment variables in hPanel:
   - `DATABASE_URL` = `file:./db/custom.db`
   - `NEXTAUTH_URL` = `https://yourdomain.com`
   - `NEXTAUTH_SECRET` = your secret
   - `NODE_ENV` = `production`

5. Click **Save**

### Step 7: Restart the Application

1. In hPanel → **Node.js** → click **Restart** on your app
2. Or via SSH:
   ```bash
   pkill -f "node app.js" ; npm run start &
   ```

### Step 8: Seed the Database

After the app is running, seed it with initial data:

```bash
# Via SSH (while app is running)
curl -X POST https://yourdomain.com/api/seed
```

Or visit `https://yourdomain.com/api/seed` in your browser (sends GET, may not work — use curl for POST).

Alternatively, the **Seed Database** button is available on the login page.

### Step 9: Verify Everything Works

1. Visit `https://yourdomain.com` — you should see the login page
2. Visit `https://yourdomain.com/api/health` — should return `{"status":"ok"}`
3. Login with the default credentials
4. Change the default password immediately!

---

## Troubleshooting Hostinger 504 Error

A **504 Gateway Timeout** means the Node.js app isn't responding. Here's how to fix it:

### 1. Check if the app is running

```bash
# Via SSH
ps aux | grep node
```

If no node process is running, the app crashed on startup.

### 2. Check error logs

```bash
# Hostinger Node.js logs
cat ~/domains/yourdomain.com/trishulhub-dashboard/logs/*.log

# Or check stderr
cd ~/domains/yourdomain.com/trishulhub-dashboard
node app.js 2>&1 | head -50
```

### 3. Common issues and fixes

| Issue | Fix |
|---|---|
| `Cannot find module 'next'` | Run `npm install` then `npm run build` |
| `Cannot find module '.next/standalone'` | Run `npm run build` to create the standalone build |
| `DATABASE_URL not set` | Create `.env` file or set env vars in hPanel |
| `SQLite database not found` | Run `npx prisma db push` to create it |
| `EADDRINUSE: port 3000` | Kill existing process: `pkill -f "node app.js"` |
| `JavaScript heap out of memory` | Build with: `NODE_OPTIONS=--max-old-space-size=512 npm run build` |
| App runs but shows 504 | Check the startup file is set to `app.js` in hPanel Node.js settings |

### 4. Alternative startup (if app.js doesn't work)

If Hostinger's Node.js selector has issues with `app.js`, try:

**Option A: Use `npm run start`**
- Set the startup command to `npm run start` in hPanel

**Option B: Use `next start` directly**
- Set the startup file to empty
- Set the run command to: `npx next start -p 3000`
- This requires full `node_modules` (no standalone mode)

### 5. Memory limit during build

If `npm run build` fails with memory error:

```bash
NODE_OPTIONS=--max-old-space-size=512 npm run build
```

---

## Project Structure

```
├── app.js              # Hostinger entry point (loads env, starts server)
├── hostinger-setup.sh  # Automated setup script for Hostinger
├── copy-standalone.js  # Build script for standalone deployment
├── standalone-start.js # Alternative startup script
├── prisma/             # Database schema
│   └── schema.prisma   # Prisma schema (14 models)
├── public/             # Static assets (logo, icons)
├── src/
│   ├── app/            # Next.js App Router pages and API routes
│   │   ├── api/        # API endpoints (auth, agents, clients, etc.)
│   │   ├── login/      # Authentication page
│   │   └── dashboard/  # Dashboard pages (agents, projects, CRM, etc.)
│   ├── components/     # Reusable UI components (shadcn/ui based)
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utility functions and configurations
│       ├── db.ts       # Prisma client singleton
│       └── auth.ts     # NextAuth configuration
└── db/                 # SQLite database (gitignored)
    └── custom.db       # Database file (created on first setup)
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production (standalone mode) |
| `npm run start` | Start production server (via app.js) |
| `npm run start:standalone` | Start using standalone build directly |
| `npm run start:next` | Start using `next start` (requires full node_modules) |
| `npm run setup` | Run Hostinger setup script |
| `npm run db:push` | Create/sync database schema |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:seed` | Seed database via API |

## License

Private — TrishulHub
