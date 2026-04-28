// ============================================================
// TrishulHub Dashboard - Hostinger Entry Point
// ============================================================
// This file is the entry point for Hostinger's Node.js selector.
// Hostinger runs: node app.js
// This script loads .env, ensures DB exists, then starts Next.js
// ============================================================

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Resolve project root (app.js is in project root)
const ROOT = __dirname;
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone');
const START_JS = path.join(STANDALONE_DIR, 'start.js');
const SERVER_JS = path.join(STANDALONE_DIR, 'server.js');
const DB_DIR = path.join(ROOT, 'db');
const DB_PATH = path.join(DB_DIR, 'custom.db');
const ENV_PATH = path.join(ROOT, '.env');

console.log('=== TrishulHub Dashboard - Starting ===');

// ─── Step 1: Load .env ────────────────────────────────────
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
  console.log('[app.js] Loaded .env file');
} else {
  console.warn('[app.js] WARNING: No .env file found at', ENV_PATH);
}

// ─── Step 2: Set defaults ─────────────────────────────────
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// ─── Step 3: Ensure database exists ───────────────────────
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log('[app.js] Created db directory');
}

if (!fs.existsSync(DB_PATH)) {
  console.log('[app.js] Database not found. Creating schema...');
  try {
    execSync('npx prisma db push', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    console.log('[app.js] Database schema created');
  } catch (err) {
    console.error('[app.js] Failed to create database schema:', err.message);
    console.error('[app.js] Trying to continue anyway...');
  }
} else {
  console.log('[app.js] Database found at', DB_PATH);
}

// ─── Step 4: Check if standalone build exists ─────────────
const useStandalone = fs.existsSync(START_JS) || fs.existsSync(SERVER_JS);

if (useStandalone) {
  console.log('[app.js] Using standalone build');

  // Set DATABASE_URL to absolute path for standalone mode
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    const relativePath = process.env.DATABASE_URL.replace('file:', '');
    const absolutePath = path.resolve(ROOT, relativePath);
    if (fs.existsSync(absolutePath)) {
      process.env.DATABASE_URL = 'file:' + absolutePath;
      console.log('[app.js] DATABASE_URL resolved to:', process.env.DATABASE_URL);
    }
  }

  // Try start.js first, then server.js
  const entryFile = fs.existsSync(START_JS) ? START_JS : SERVER_JS;
  console.log('[app.js] Starting:', entryFile);
  require(entryFile);
} else {
  // ─── Fallback: Use next start (requires full node_modules) ───
  console.log('[app.js] No standalone build found. Using next start...');
  try {
    const { createServer } = require('next/dist/server/lib/start-server');
    const nextConfig = require(path.join(ROOT, 'next.config.ts')) || require(path.join(ROOT, 'next.config.js')) || require(path.join(ROOT, 'next.config.mjs'));

    // Try to start using next's internal start mechanism
    const port = parseInt(process.env.PORT || '3000', 10);
    const hostname = process.env.HOSTNAME || '0.0.0.0';

    // Use child process to run next start
    const { spawn } = require('child_process');
    const child = spawn('node', ['node_modules/.bin/next', 'start', '-p', String(port), '-H', hostname], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', (err) => {
      console.error('[app.js] Failed to start next:', err.message);
      process.exit(1);
    });
    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('[app.js] Failed to start the application.');
    console.error('[app.js] Make sure you have run: npm run build');
    console.error('[app.js] Error:', err.message);
    process.exit(1);
  }
}
