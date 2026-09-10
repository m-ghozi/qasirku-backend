import { prisma } from '../src/lib/prisma';
import { hashPin } from '../src/utils/auth';

async function main() {
  console.log('🌱 Memulai proses seeding database...');

  // ============================================================
  // 1. USER OWNER DEFAULT
  // ============================================================
  // PIN owner bisa diatur lewat env SEED_OWNER_PIN. Default '123456' hanya untuk
  // development — WAJIB diganti di produksi (atau set SEED_OWNER_PIN saat seeding).
  const ownerPin = process.env.SEED_OWNER_PIN || '123456';
  const owner = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      name: 'Pemilik Toko',
      pinHash: hashPin(ownerPin),
      role: 'owner',
      permissions: ['ALL'],
      isActive: true,
    },
  });
  console.log(`👤 User owner: ${owner.username}`);
  if (!process.env.SEED_OWNER_PIN) {
    console.warn('⚠️  PIN owner default (123456) dipakai. Ganti PIN ini setelah login pertama!');
  }

  // ============================================================
  // 2. STORE SETTING DEFAULT
  // ============================================================
  await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: 'Qasirku',
      address: 'Earth',
      phone: '08123456789',
      receiptFooter: 'Terima kasih atas kunjungan Anda!',
      onboardingDone: false,
      themeColor: '217',
      logo: "data:image/jpeg;base64,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"
    },
  });
  console.log('🏪 Store setting default dibuat');

  // ============================================================
  // 3. PAYMENT METHODS DEFAULT
  // ============================================================
  const paymentMethods = [
    { name: 'Tunai', category: 'tunai', isDefault: true },
    { name: 'Transfer Bank', category: 'transfer', isDefault: false },
    { name: 'QRIS', category: 'qris', isDefault: false },
    { name: 'E-Wallet', category: 'e-wallet', isDefault: false },
  ];

  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { name: pm.name },
      update: {},
      create: pm,
    });
  }
  console.log(`💳 Payment methods: ${paymentMethods.map(p => p.name).join(', ')}`);

  // ============================================================
  // 4. KATEGORI PRODUK DEFAULT
  // ============================================================
  const productCategories = [
    { name: 'Sembako', color: '#F97316', icon: '🛒' },
    { name: 'Minuman', color: '#3B82F6', icon: '🥤' },
    { name: 'Makanan & Snack', color: '#F59E0B', icon: '🍿' },
    { name: 'Kebersihan', color: '#10B981', icon: '🧼' },
    { name: 'Perawatan Diri', color: '#EC4899', icon: '🧴' },
    { name: 'Kesehatan', color: '#EF4444', icon: '💊' },
    { name: 'Rumah Tangga', color: '#8B5CF6', icon: '🏠' },
    { name: 'Alat Tulis', color: '#6366F1', icon: '✏️' },
    { name: 'Pulsa & Token', color: '#06B6D4', icon: '📱' },
    { name: 'Rokok', color: '#78716C', icon: '🚬' },
    { name: 'Lainnya', color: '#6B7280', icon: '📦' },
  ];

  let catCreated = 0;
  let catSkipped = 0;
  for (const cat of productCategories) {
    const existing = await prisma.category.findFirst({ where: { name: cat.name, isDeleted: false } });
    if (existing) { catSkipped++; continue; }
    await prisma.category.create({ data: cat });
    catCreated++;
  }
  console.log(`🗂️  Kategori produk: ${catCreated} dibuat, ${catSkipped} dilewati`);

  // ============================================================
  // 5. SATUAN (UNITS) DEFAULT
  // ============================================================
  const units = [
    { name: 'pcs', isDefault: true },
    { name: 'buah', isDefault: false },
    { name: 'lusin', isDefault: false },
    { name: 'kodi', isDefault: false },
    { name: 'gross', isDefault: false },
    { name: 'dus', isDefault: false },
    { name: 'karton', isDefault: false },
    { name: 'kg', isDefault: false },
    { name: 'gram', isDefault: false },
    { name: 'ons', isDefault: false },
    { name: 'liter', isDefault: false },
    { name: 'ml', isDefault: false },
    { name: 'botol', isDefault: false },
    { name: 'kaleng', isDefault: false },
    { name: 'bungkus', isDefault: false },
    { name: 'sachet', isDefault: false },
    { name: 'meter', isDefault: false },
    { name: 'roll', isDefault: false },
    { name: 'lembar', isDefault: false },
    { name: 'set', isDefault: false },
    { name: 'pasang', isDefault: false },
    { name: 'pak', isDefault: false },
  ];

  let unitsCreated = 0;
  let unitsSkipped = 0;
  for (const unit of units) {
    const existing = await prisma.unit.findFirst({ where: { name: unit.name, isDeleted: false } });
    if (existing) { unitsSkipped++; continue; }
    await prisma.unit.create({ data: unit });
    unitsCreated++;
  }
  console.log(`📏 Units: ${unitsCreated} dibuat, ${unitsSkipped} dilewati`);

  // ============================================================
  // 6. KATEGORI PENGELUARAN DEFAULT
  // ============================================================
  const expenseCategories = [
    { name: 'Listrik & Air', color: '#FBBF24', icon: '💡', isDefault: true },
    { name: 'Sewa', color: '#8B5CF6', icon: '🏠', isDefault: false },
    { name: 'Gaji', color: '#10B981', icon: '👤', isDefault: false },
    { name: 'Transport', color: '#3B82F6', icon: '🚚', isDefault: false },
    { name: 'Operasional', color: '#F97316', icon: '🧰', isDefault: false },
    { name: 'Pembelian', color: '#EF4444', icon: '🛍️', isDefault: false },
    { name: 'Perawatan', color: '#06B6D4', icon: '🔧', isDefault: false },
    { name: 'Lainnya', color: '#6B7280', icon: '📦', isDefault: false },
  ];

  let expCatCreated = 0;
  let expCatSkipped = 0;
  for (const cat of expenseCategories) {
    const existing = await prisma.expenseCategory.findFirst({ where: { name: cat.name, isDeleted: false } });
    if (existing) { expCatSkipped++; continue; }
    await prisma.expenseCategory.create({ data: cat });
    expCatCreated++;
  }
  console.log(`💸 Kategori pengeluaran: ${expCatCreated} dibuat, ${expCatSkipped} dilewati`);

  // ============================================================
  // RINGKASAN
  // ============================================================
  console.log('\n✅ Seeding selesai!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });