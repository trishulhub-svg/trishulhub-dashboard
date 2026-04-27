// Copy-standalone script - copies all needed files into the .next/standalone directory
// This runs after `next build` as part of the build process
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const standalone = path.join(root, '.next', 'standalone');

console.log('📦 Setting up standalone deployment...');

// Helper: copy dir recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`❌ Source not found: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  // 1. Copy static files
  console.log('  Copying static files...');
  copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));

  // 2. Copy public assets
  console.log('  Copying public assets...');
  copyDir(path.join(root, 'public'), path.join(standalone, 'public'));

  // 3. Copy database
  console.log('  Copying database...');
  fs.mkdirSync(path.join(standalone, 'db'), { recursive: true });
  const dbFile = path.join(root, 'db', 'custom.db');
  if (fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, path.join(standalone, 'db', 'custom.db'));
  } else {
    console.warn('  ⚠️ No database file found, will need to seed after startup');
  }

  // 4. Copy Prisma schema
  console.log('  Copying Prisma schema...');
  fs.mkdirSync(path.join(standalone, 'prisma'), { recursive: true });
  fs.copyFileSync(path.join(root, 'prisma', 'schema.prisma'), path.join(standalone, 'prisma', 'schema.prisma'));

  // 5. Copy .env
  console.log('  Copying .env...');
  if (fs.existsSync(path.join(root, '.env'))) {
    fs.copyFileSync(path.join(root, '.env'), path.join(standalone, '.env'));
  }

  // 6. Copy start script
  console.log('  Copying start script...');
  const startScript = path.join(root, 'standalone-start.js');
  if (fs.existsSync(startScript)) {
    fs.copyFileSync(startScript, path.join(standalone, 'start.js'));
  }

  // 7. Patch server.js to load .env and handle DATABASE_URL redirection
  console.log('  Patching server.js with .env loader...');
  const serverJsPath = path.join(standalone, 'server.js');
  if (fs.existsSync(serverJsPath)) {
    let serverJs = fs.readFileSync(serverJsPath, 'utf8');

    // Only patch if not already patched
    if (!serverJs.includes('Load .env file')) {
      const envLoader = `const fs = require('fs')
// Load .env file (platform may not auto-load it)
const envPath = require('path').join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  })
  console.log('Loaded .env from:', envPath)
}
// Handle DATABASE_URL - redirect /app/db/ to ./db/ if needed
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('/app/db/')) {
  const appDbPath = process.env.DATABASE_URL.replace('file:', '')
  if (!fs.existsSync(appDbPath)) {
    console.log('Redirecting DATABASE_URL from /app/db/ to ./db/custom.db')
    process.env.DATABASE_URL = 'file:./db/custom.db'
  }
}
`;

      // Insert after the first require('path') line
      serverJs = serverJs.replace(
        "const path = require('path')",
        "const path = require('path')\n" + envLoader
      );
      fs.writeFileSync(serverJsPath, serverJs);
      console.log('  ✅ server.js patched');
    } else {
      console.log('  ℹ️ server.js already patched');
    }
  }

  // 8. Create /app/db/ directory and copy database there for platform compatibility
  console.log('  Setting up /app/db/ for platform compatibility...');
  try {
    const appDbDir = '/app/db';
    if (!fs.existsSync(appDbDir)) {
      fs.mkdirSync(appDbDir, { recursive: true });
    }
    if (fs.existsSync(dbFile)) {
      fs.copyFileSync(dbFile, path.join(appDbDir, 'custom.db'));
      console.log('  ✅ Database copied to /app/db/custom.db');
    }
  } catch (err) {
    console.log('  ⚠️ Cannot create /app/db/ (permissions), will rely on .env redirect');
  }

  // 9. Generate Prisma client inside standalone
  console.log('  Generating Prisma client in standalone...');
  try {
    execSync('npx prisma generate', {
      cwd: standalone,
      stdio: 'pipe',
      timeout: 60000
    });
    console.log('  ✅ Prisma client generated');
  } catch (err) {
    console.warn('  ⚠️ Prisma generate failed in standalone (will use pre-generated client)');
  }

  console.log('✅ Standalone setup complete!');
} catch (err) {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
}
