// ============================================================
// TrishulHub Dashboard - Auto-Seed Script
// ============================================================
// Called by app.js during startup if database hasn't been seeded yet
// Creates default admin user and AI agents
// ============================================================

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function seed() {
  const prisma = new PrismaClient();

  try {
    // Check if already seeded
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('[seed] ✅ Database already has ' + userCount + ' users, skipping seed');
      return true;
    }

    console.log('[seed] 🔧 Seeding database...');

    // Hash the default password
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create default admin user
    const admin = await prisma.user.create({
      data: {
        name: 'Taroon',
        email: 'taroon@trishulhub.in',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
      }
    });
    console.log('[seed] ✅ Admin user created');

    // Create additional team members
    await prisma.user.create({
      data: { name: 'Pruthvi', email: 'pruthvi@trishulhub.in', password: hashedPassword, role: 'ADMIN', isActive: true }
    });
    await prisma.user.create({
      data: { name: 'Kiran', email: 'kiran@trishulhub.in', password: hashedPassword, role: 'DEVELOPER', isActive: true }
    });

    // Create client user
    const clientUser = await prisma.user.create({
      data: { name: 'Rahul Sharma', email: 'rahul@example.com', password: hashedPassword, role: 'CLIENT', isActive: true }
    });

    // Create AI agents
    const agents = [
      { name: 'Dev Agent', type: 'DEV', description: 'Writes code, builds websites, fixes bugs, deploys projects', model: 'openai/gpt-4o-mini', systemPrompt: 'You are an expert web developer for TrishulHub. You write clean, responsive HTML, CSS, JavaScript, and PHP code. When given a project requirement, you generate complete, working code. Always include comments in your code.', status: 'IDLE' },
      { name: 'Client Hunter Agent', type: 'CLIENT_HUNTER', description: 'Finds new clients, drafts cold emails, manages lead outreach', model: 'openai/gpt-4o-mini', systemPrompt: 'You are an expert sales agent for TrishulHub. Your job is to find businesses that need websites and reach out to them. Keep emails short, professional, and focused on value.', status: 'IDLE' },
      { name: 'Finance Agent', type: 'FINANCE', description: 'Generates invoices, tracks payments, creates financial reports', model: 'openai/gpt-4o-mini', systemPrompt: 'You are a financial assistant for TrishulHub. Generate invoices, track payments, create financial reports. Calculate amounts accurately.', status: 'IDLE' },
      { name: 'Project Manager Agent', type: 'PROJECT_MANAGER', description: 'Breaks down projects into tasks, tracks deadlines, generates reports', model: 'openai/gpt-4o-mini', systemPrompt: 'You are a project manager for TrishulHub. Break down projects into tasks, set deadlines, track progress.', status: 'IDLE' },
      { name: 'HR Agent', type: 'HR', description: 'Tracks attendance, manages leave, monitors workload', model: 'meta-llama/llama-3.3-70b-instruct:free', systemPrompt: 'You are an HR coordinator for TrishulHub. Track attendance, manage leave, monitor workload.', status: 'IDLE' },
      { name: 'Content Agent', type: 'CONTENT', description: 'Writes website copy, social media posts, blog articles', model: 'openai/gpt-4o-mini', systemPrompt: 'You are a content writer for TrishulHub. Write professional, engaging, SEO-optimized content.', status: 'IDLE' },
      { name: 'Support Agent', type: 'SUPPORT', description: 'Handles client tickets, answers FAQs, provides technical support', model: 'meta-llama/llama-3.3-70b-instruct:free', systemPrompt: 'You are a customer support agent for TrishulHub. Help clients with questions about their websites and hosting.', status: 'IDLE' },
    ];

    await Promise.all(agents.map(a => prisma.agent.create({ data: a })));
    console.log('[seed] ✅ 7 AI agents created');

    // Create sample clients
    const clients = await Promise.all([
      prisma.client.create({ data: { name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+91-9876543210', company: 'Sharma Electronics', website: 'sharmaelectronics.in', status: 'ACTIVE', userId: clientUser.id } }),
      prisma.client.create({ data: { name: 'Priya Patel', email: 'priya@beautylounge.com', phone: '+91-9876543211', company: 'Priya Beauty Lounge', website: 'priyabeautylounge.com', status: 'ACTIVE' } }),
      prisma.client.create({ data: { name: 'Amit Verma', email: 'amit@vermarestaurant.com', phone: '+91-9876543212', company: 'Verma Restaurant', status: 'ACTIVE' } }),
    ]);
    console.log('[seed] ✅ 3 clients created');

    // Create sample projects
    await Promise.all([
      prisma.project.create({ data: { name: 'Sharma Electronics Website', clientId: clients[0].id, status: 'IN_PROGRESS', progress: 65, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), budget: 15000 } }),
      prisma.project.create({ data: { name: 'Priya Beauty Lounge Website', clientId: clients[1].id, status: 'REVIEW', progress: 90, deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), budget: 12000 } }),
      prisma.project.create({ data: { name: 'Verma Restaurant Website', clientId: clients[2].id, status: 'PLANNING', progress: 10, deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), budget: 18000 } }),
    ]);
    console.log('[seed] ✅ 3 projects created');

    // Create sample leads
    await Promise.all([
      prisma.lead.create({ data: { name: 'Vikram Singh', email: 'vikram@fitnessgym.com', company: 'Fitness Gym', website: 'fitnessgym.in', source: 'AI_FOUND', score: 78, status: 'CONTACTED' } }),
      prisma.lead.create({ data: { name: 'Neha Gupta', email: 'neha@fashionboutique.com', company: 'Fashion Boutique', source: 'MANUAL', score: 65, status: 'INTERESTED' } }),
      prisma.lead.create({ data: { name: 'Rajesh Kumar', email: 'rajesh@autodealer.com', company: 'Kumar Auto Dealer', website: 'kumarauto.in', source: 'AI_FOUND', score: 82, status: 'NEW' } }),
    ]);
    console.log('[seed] ✅ 3 leads created');

    // Create sample expenses
    await Promise.all([
      prisma.expense.create({ data: { category: 'HOSTING', description: 'Hostinger Cloud Plan', amount: 7.99, date: new Date() } }),
      prisma.expense.create({ data: { category: 'API_COSTS', description: 'OpenRouter API', amount: 5.50, date: new Date() } }),
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
