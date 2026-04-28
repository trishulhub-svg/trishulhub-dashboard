# TrishulHub AI Agent Dashboard

A comprehensive AI-powered agent management dashboard built with Next.js 16, React 19, Prisma, and SQLite.

## Features

- **Agent Management** — Create, configure, and monitor AI agents with real-time status tracking
- **Project Management** — Organize agents into projects with team collaboration
- **CRM Integration** — Client relationship management with contact tracking
- **Finance Dashboard** — Revenue tracking, billing, and financial analytics
- **Team Management** — Role-based access control (Super Admin, Admin, Client)
- **API Key Management** — Secure API key generation and usage monitoring
- **Approval Workflow** — Request and approval system for agent deployments
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

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- npm, yarn, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/trishulhub-svg/trishulhub-dashboard.git
cd trishulhub-dashboard

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# Seed the database (creates default admin user)
npx prisma db seed

# Start development server
npm run dev
```

### Default Login

- **Email:** admin@trishulhub.com
- **Password:** admin123

> Change these credentials immediately after first login in production.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLite database path | `file:./db/custom.db` |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Secret for NextAuth JWT signing | Required in production |
| `HOSTNAME` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `3000` |

## Production Deployment

### Build for Production

```bash
npm run build
```

This runs `next build` (with `output: "standalone"`) followed by `copy-standalone.js` which prepares the standalone deployment bundle.

### Run in Production

```bash
npm run start
```

Or using the standalone build directly:

```bash
NODE_ENV=production node .next/standalone/start.js
```

### Platform Deployment (space-z.ai)

The `copy-standalone.js` script automatically patches `server.js` to:
- Detect Bun runtime and re-spawn with Node.js (Bun cannot resolve Next.js standalone packages)
- Load `.env` file from the same directory
- Redirect `DATABASE_URL` if the platform path doesn't exist

## Project Structure

```
├── prisma/           # Database schema and migrations
├── public/           # Static assets (logo, icons)
├── src/
│   ├── app/          # Next.js App Router pages and API routes
│   │   ├── api/      # API endpoints
│   │   ├── login/    # Authentication page
│   │   └── dashboard/# Dashboard pages
│   ├── components/   # Reusable UI components
│   ├── hooks/        # Custom React hooks
│   └── lib/          # Utility functions and configurations
├── copy-standalone.js # Build script for standalone deployment
└── standalone-start.js # Production startup script
```

## License

Private — TrishulHub
