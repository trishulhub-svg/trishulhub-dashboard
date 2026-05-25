// ============================================================
// TrishulHub Dashboard - Auto-Setup Entry Point
// ============================================================
// Hostinger runs: node app.js
//
// AUTO-SETUP: On first start, automatically:
//   1. Creates .env if missing
//   2. Creates database directory
//   3. Runs prisma db push (creates tables)
//   4. Seeds the database with default admin user + sample data
//   5. Starts the Next.js server
//
// No SSH or manual commands needed!
// ============================================================

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = __dirname;
const STANDALONE_DIR = path.join(ROOT, '.next', 'standalone');
const START_JS = path.join(STANDALONE_DIR, 'start.js');
const SERVER_JS = path.join(STANDALONE_DIR, 'server.js');
const DB_DIR = path.join(ROOT, 'db');
const DB_PATH = path.join(DB_DIR, 'custom.db');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');
const SEED_LOCK = path.join(DB_DIR, '.seeded');

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║     TrishulHub Dashboard - Starting      ║');
console.log('╚══════════════════════════════════════════╝');

// ─── Step 1: Create .env if missing ────────────────────────
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  } else {
    fs.writeFileSync(ENV_PATH,
      'DATABASE_URL=file:./db/custom.db\n' +
      'NEXTAUTH_URL=http://localhost:3000\n' +
      'NEXTAUTH_SECRET=trishulhub-secret-change-in-production\n' +
      'HOSTNAME=0.0.0.0\n' +
      'PORT=3000\n'
    );
  }
  console.log('[1/5] ✅ Created .env file');
} else {
  console.log('[1/5] ✅ .env exists');
}

// ─── Step 2: Load .env ─────────────────────────────────────
try {
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
} catch (e) {
  console.warn('[2/5] ⚠️ Could not read .env');
}
console.log('[2/5] ✅ Environment loaded');

// ─── Step 3: Create database if missing ────────────────────
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbNeedsCreate = !fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size < 512;

if (dbNeedsCreate) {
  console.log('[3/5] 🔧 Creating database schema...');
  try {
    // Make sure prisma client is generated
    try { execSync('npx prisma generate', { cwd: ROOT, stdio: 'pipe', timeout: 60000 }); } catch(e) {}
    execSync('npx prisma db push', { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
    console.log('[3/5] ✅ Database schema created');
  } catch (err) {
    console.error('[3/5] ⚠️ Auto-create failed:', err.message);
    console.error('       Run manually: npx prisma db push');
  }
} else {
  console.log('[3/5] ✅ Database exists');
}

// ─── Step 4: Auto-seed if not seeded yet ───────────────────
if (!fs.existsSync(SEED_LOCK) && fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size >= 512) {
  console.log('[4/5] 🔧 Seeding database with default data...');
  try {
    execSync('node ' + path.join(ROOT, 'seed.js'), {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 30000,
      env: process.env
    });
    // Create seed lock so we don't re-seed
    fs.writeFileSync(SEED_LOCK, new Date().toISOString());
    console.log('[4/5] ✅ Database seeded');
  } catch (err) {
    console.error('[4/5] ⚠️ Auto-seed failed - you can seed later via the login page');
  }
} else if (fs.existsSync(SEED_LOCK)) {
  console.log('[4/5] ✅ Database already seeded');
} else {
  console.log('[4/5] ⏭️ Skipped (no database yet)');
}

// ─── Step 5: Start the Next.js server ──────────────────────
console.log('[5/5] 🚀 Starting server on ' + process.env.HOSTNAME + ':' + process.env.PORT);
console.log('');

const useStandalone = fs.existsSync(START_JS) || fs.existsSync(SERVER_JS);

if (useStandalone) {
  // Resolve DATABASE_URL to absolute path for standalone mode
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    const relativePath = process.env.DATABASE_URL.replace('file:', '');
    const absolutePath = path.resolve(ROOT, relativePath);
    process.env.DATABASE_URL = 'file:' + absolutePath;
  }

  const entryFile = fs.existsSync(START_JS) ? START_JS : SERVER_JS;
  console.log('Starting: ' + path.relative(ROOT, entryFile));
  require(entryFile);
} else {
  // Fallback: Use next start (requires full node_modules)
  console.log('Starting: next start');
  const { spawn } = require('child_process');
  const child = spawn('node', [
    'node_modules/.bin/next', 'start',
    '-p', String(process.env.PORT || '3000'),
    '-H', process.env.HOSTNAME || '0.0.0.0'
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  child.on('error', (err) => {
    console.error('❌ Failed to start:', err.message);
    process.exit(1);
  });
  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
