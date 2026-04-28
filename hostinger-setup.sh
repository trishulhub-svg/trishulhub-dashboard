#!/bin/bash
# ============================================================
# TrishulHub Dashboard - Hostinger Deployment Setup Script
# ============================================================
# Run this script AFTER cloning the repo on Hostinger SSH terminal
# Usage: bash hostinger-setup.sh
# ============================================================

set -e

echo "============================================"
echo "  TrishulHub Dashboard - Hostinger Setup"
echo "============================================"

# 1. Install dependencies
echo ""
echo "[1/6] Installing dependencies..."
npm install

# 2. Create .env file if it doesn't exist
echo ""
echo "[2/6] Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
  echo "  ⚠️  IMPORTANT: Edit .env and set your NEXTAUTH_URL and NEXTAUTH_SECRET!"
else
  echo "  .env already exists, skipping..."
fi

# 3. Create db directory
echo ""
echo "[3/6] Creating database directory..."
mkdir -p db

# 4. Generate Prisma client
echo ""
echo "[4/6] Generating Prisma client..."
npx prisma generate

# 5. Push database schema (creates custom.db)
echo ""
echo "[5/6] Creating database schema..."
npx prisma db push

# 6. Build the Next.js app
echo ""
echo "[6/6] Building Next.js application..."
echo "  (This may take 2-5 minutes...)"
npm run build

echo ""
echo "============================================"
echo "  ✅ Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Edit .env file:"
echo "     - Set NEXTAUTH_URL to your domain (e.g., https://yourdomain.com)"
echo "     - Set NEXTAUTH_SECRET to a random secret string"
echo "  2. In Hostinger hPanel → Node.js:"
echo "     - Application root: your project folder"
echo "     - Application startup file: .next/standalone/start.js"
echo "     - Or use: npm run start (if custom startup not supported)"
echo "  3. Seed the database by visiting:"
echo "     https://yourdomain.com/api/seed"
echo "     (POST request, or use: curl -X POST https://yourdomain.com/api/seed)"
echo ""
echo "Default login after seeding:"
echo "  Email: taroon@trishulhub.in"
echo "  Password: password123"
echo ""
