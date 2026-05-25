// Startup script that loads .env before starting the standalone server
const path = require('path');
const fs = require('fs');

// Load .env file manually since standalone mode doesn't auto-load it
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      // Only set if not already provided by the platform environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log('✅ Loaded .env file from:', envPath);
} else {
  console.log('⚠️  No .env file found at:', envPath);
}

// Ensure critical env vars have defaults
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
// Platform may provide PORT - if not, default to 3000 (Caddy proxies 81→3000)
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

console.log(`🚀 Starting TrishulHub on ${process.env.HOSTNAME}:${process.env.PORT}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL}`);

// Ensure database exists
const dbPath = path.join(__dirname, 'db', 'custom.db');
if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log(`✅ Database found at: ${dbPath} (${stats.size} bytes)`);
} else {
  console.error('❌ Database NOT found at:', dbPath);
  // Try to create the db directory
  const dbDir = path.join(__dirname, 'db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('📁 Created db directory');
  }
}

// Ensure prisma schema exists
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
if (fs.existsSync(schemaPath)) {
  console.log('✅ Prisma schema found at:', schemaPath);
} else {
  console.error('❌ Prisma schema NOT found at:', schemaPath);
}

// Start the standalone server
try {
  require('./server.js');
} catch (err) {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
}
