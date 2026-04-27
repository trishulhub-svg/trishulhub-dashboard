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
process.env.PORT = process.env.PORT || '3000';
process.env.HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// Start the standalone server
require('./server.js');
