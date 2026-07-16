// ============================================================
// TrishulHub Dashboard - Auto-Seed Script
// ============================================================

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function seed() {
  // Use local SQLite for seeding (the app uses Turso via adapter)
  const prisma = new PrismaClient();

  try {
    // Check if already seeded
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('[seed] ✅ Database already has ' + userCount + ' users, skipping seed');
      return true;
    }

    console.log('[seed] 🔧 Seeding database...');

    const hashedPassword = await bcrypt.hash('password123', 12);

    // ━━ Create Users ━━
    const taroon = await prisma.user.create({
      data: { name: 'Taroon', email: 'taroon@trishulhub.in', password: hashedPassword, role: 'SUPER_ADMIN', department: 'MANAGEMENT', isActive: true }
    });
    const pruthvi = await prisma.user.create({
      data: { name: 'Pruthvi', email: 'pruthvi@trishulhub.in', password: hashedPassword, role: 'ADMIN', department: 'SALES', isActive: true }
    });
    const kiran = await prisma.user.create({
      data: { name: 'Kiran', email: 'kiran@trishulhub.in', password: hashedPassword, role: 'DEVELOPER', department: 'DEV', isActive: true }
    });
    const akshat = await prisma.user.create({
      data: { name: 'Akshat', email: 'akshat@trishulhub.in', password: hashedPassword, role: 'DEVELOPER', department: 'DEV', isActive: true }
    });
    console.log('[seed] ✅ 4 users created');

        // In-app AI Agents removed — Workspace uses external Cursor agents

// ━━ Create Sample Clients ━━
    const clients = await Promise.all([
      prisma.client.create({ data: { name: 'Priya Patel', email: 'priya@beautylounge.com', phone: '+91-9876543211', company: 'Priya Beauty Lounge', website: 'priyabeautylounge.com', status: 'ACTIVE' } }),
      prisma.client.create({ data: { name: 'Amit Verma', email: 'amit@vermarestaurant.com', phone: '+91-9876543212', company: 'Verma Restaurant', status: 'ACTIVE' } }),
    ]);
    console.log('[seed] ✅ 2 clients created');

    // ━━ Create Sample Projects ━━
    await Promise.all([
      prisma.project.create({ data: { name: 'Priya Beauty Lounge Website', clientId: clients[0].id, status: 'REVIEW', progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
      prisma.project.create({ data: { name: 'Verma Restaurant Website', clientId: clients[1].id, status: 'PLANNING', progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
    ]);
    console.log('[seed] ✅ 2 projects created');

    // ━━ Create Sample Leads ━━
    await Promise.all([
      prisma.lead.create({ data: { name: 'Vikram Singh', email: 'vikram@fitnessgym.com', company: 'Fitness Gym', website: 'fitnessgym.in', source: 'AI_FOUND', score: 78, status: 'CONTACTED' } }),
      prisma.lead.create({ data: { name: 'Neha Gupta', email: 'neha@fashionboutique.com', company: 'Fashion Boutique', source: 'MANUAL', score: 65, status: 'INTERESTED' } }),
      prisma.lead.create({ data: { name: 'Rajesh Kumar', email: 'rajesh@autodealer.com', company: 'Kumar Auto Dealer', website: 'kumarauto.in', source: 'AI_FOUND', score: 82, status: 'NEW' } }),
    ]);
    console.log('[seed] ✅ 3 leads created');

    // ━━ Create Sample Expenses ━━
    await Promise.all([
      prisma.expense.create({ data: { category: 'HOSTING', description: 'Hostinger Cloud Plan', amount: 7.99, date: new Date() } }),
      prisma.expense.create({ data: { category: 'API_COSTS', description: 'Z.ai API', amount: 5.50, date: new Date() } }),
      prisma.expense.create({ data: { category: 'DOMAINS', description: 'Client domain renewals', amount: 24.00, date: new Date() } }),
    ]);
    console.log('[seed] ✅ 3 expenses created');

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🎉 DATABASE SEEDED SUCCESSFULLY!           ║');
    console.log('║                                              ║');
    console.log('║   Login Credentials:                         ║');
    console.log('║   Email:    taroon@trishulhub.in             ║');
    console.log('║   Password: password123                      ║');
    console.log('║                                              ║');
    console.log('║   ⚠️  Change password after first login!      ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    return true;
  } catch (err) {
    console.error('[seed] ❌ Seeding failed:', err.message);
    console.error(err);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
seed().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
