// Copy-standalone script - sets up the .next/standalone directory for deployment
// This runs after `next build` as part of the build process
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const standalone = path.join(root, '.next', 'standalone');

console.log('📦 Setting up standalone deployment...');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

try {
  // 1. Copy static, public, db, prisma, .env, start.js
  console.log('  Copying files...');
  copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
  copyDir(path.join(root, 'public'), path.join(standalone, 'public'));
  fs.mkdirSync(path.join(standalone, 'db'), { recursive: true });
  if (fs.existsSync(path.join(root, 'db', 'custom.db'))) {
    fs.copyFileSync(path.join(root, 'db', 'custom.db'), path.join(standalone, 'db', 'custom.db'));
  }
  fs.mkdirSync(path.join(standalone, 'prisma'), { recursive: true });
  fs.copyFileSync(path.join(root, 'prisma', 'schema.prisma'), path.join(standalone, 'prisma', 'schema.prisma'));
  if (fs.existsSync(path.join(root, '.env'))) fs.copyFileSync(path.join(root, '.env'), path.join(standalone, '.env'));
  if (fs.existsSync(path.join(root, 'standalone-start.js'))) {
    fs.copyFileSync(path.join(root, 'standalone-start.js'), path.join(standalone, 'start.js'));
  }

  // 2. Restructure server.js for Bun compatibility
  // The deployment platform runs `bun server.js` but Next.js requires Node.js.
  // Fix: Copy original server.js → _server_real.js, create wrapper server.js
  console.log('  Setting up Bun/Node compatibility...');
  const serverJsPath = path.join(standalone, 'server.js');
  const realServerPath = path.join(standalone, '_server_real.js');

  if (fs.existsSync(serverJsPath) && !fs.existsSync(realServerPath)) {
    // Step A: Copy the original server.js to _server_real.js
    fs.copyFileSync(serverJsPath, realServerPath);

    // Step B: Add .env loader to _server_real.js
    let realJs = fs.readFileSync(realServerPath, 'utf8');
    if (!realJs.includes('Load .env file')) {
      const envPatch = `const fs = require('fs')

// Load .env file
const envPath = path.join(__dirname, '.env')
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

// Handle DATABASE_URL redirect
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('/app/db/')) {
  const appDbPath = process.env.DATABASE_URL.replace('file:', '')
  if (!fs.existsSync(appDbPath)) {
    console.log('Redirecting DATABASE_URL from /app/db/ to ./db/custom.db')
    process.env.DATABASE_URL = 'file:' + path.join(__dirname, 'db', 'custom.db')
  }
}
`;
      realJs = realJs.replace("const path = require('path')\n", "const path = require('path')\n" + envPatch);
      fs.writeFileSync(realServerPath, realJs);
    }

    // Step C: Create new server.js wrapper
    const wrapper = `// TrishulHub server.js - Bun/Node.js compatible wrapper
// Platform runs: bun server.js → this detects Bun and switches to Node.js

const path = require('path')
const fs = require('fs')

const isBun = process.execPath.includes('bun') || (typeof Bun !== 'undefined')

if (isBun) {
  console.log('[wrapper] Detected Bun runtime, switching to Node.js...')

  const localNodeModules = path.join(__dirname, 'node_modules')
  const newEnv = Object.assign({}, process.env, {
    NODE_PATH: localNodeModules
  })

  try {
    const { execFileSync } = require('child_process')
    execFileSync('node', [path.join(__dirname, '_server_real.js')], {
      stdio: 'inherit',
      env: newEnv,
      cwd: __dirname
    })
    process.exit(0)
  } catch (e) {
    try {
      const { spawn } = require('child_process')
      const child = spawn('node', [path.join(__dirname, '_server_real.js')], {
        stdio: 'inherit',
        env: newEnv,
        cwd: __dirname,
        detached: true
      })
      child.on('close', (code) => process.exit(code || 0))
      child.on('error', () => {
        console.error('[wrapper] Failed to start with Node.js')
        process.exit(1)
      })
      return
    } catch (e2) {
      console.error('[wrapper] Failed:', e2.message)
      process.exit(1)
    }
  }
}

// Running under Node.js - load .env and start
const envPath = path.join(__dirname, '.env')
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

if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('/app/db/')) {
  const appDbPath = process.env.DATABASE_URL.replace('file:', '')
  if (!fs.existsSync(appDbPath)) {
    console.log('Redirecting DATABASE_URL from /app/db/ to ./db/custom.db')
    process.env.DATABASE_URL = 'file:' + path.join(__dirname, 'db', 'custom.db')
  }
}

require('./_server_real.js')
`;
    fs.writeFileSync(serverJsPath, wrapper);
    console.log('  ✅ server.js restructured (Bun→Node wrapper)');
  }

  // 3. Generate Prisma client
  console.log('  Generating Prisma client...');
  try {
    execSync('npx prisma generate', { cwd: standalone, stdio: 'pipe', timeout: 60000 });
    console.log('  ✅ Prisma client generated');
  } catch (err) {
    console.warn('  ⚠️ Prisma generate failed (using pre-generated client)');
  }

  console.log('✅ Standalone setup complete!');
} catch (err) {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
}
