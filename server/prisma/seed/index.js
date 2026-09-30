// ==================================================================
// Food Delivery Platform — database seeder
// Run with: npm run prisma:seed  (prisma db seed)   [DO NOT run now]
// Seeds: roles/permissions, admins, cuisines, restaurants+branches,
// menus (categories/items/variants/add-ons/combos), drivers,
// customers, orders, payments, promos, loyalty config, surge zones.
// ==================================================================

const { PrismaClient } = require('@prisma/client');
const {
  bcrypt, PASSWORD, CUISINES, PLATFORM_SETTINGS, CUSTOMERS, DRIVERS,
  CENTER, RESTAURANTS, PROMO_CODES, SURGE_ZONES,
} = require('./data');

const prisma = new PrismaClient();

const hash = () => bcrypt.hashSync(PASSWORD, 10);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const dec = (n) => Number(n).toFixed(2);
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

// RBAC permission matrix stored as a platform setting for tooling/UIs
const PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'restaurant.approve', 'restaurant.reject', 'restaurant.suspend',
    'driver.approve', 'driver.reject', 'driver.suspend',
    'customer.manage', 'order.view_all', 'order.force_cancel',
    'dispute.resolve', 'refund.process', 'promo.manage',
    'loyalty.manage', 'content.moderate', 'payout.process',
    'report.view', 'announcement.publish',
  ],
  OPS_MANAGER: [
    'delivery.monitor', 'driver.fleet_manage', 'driver.reassign',
    'surge.manage', 'geofence.manage', 'order.view_all', 'heatmap.view',
  ],
  SUPPORT_AGENT: [
    'ticket.view_queue', 'ticket.reply', 'ticket.resolve',
    'refund.request', 'wallet.credit', 'order.view_all',
  ],
  RESTAURANT_OWNER: [
    'restaurant.profile.manage', 'branch.manage', 'menu.manage',
    'order.view_branch', 'order.update_status', 'earnings.view',
    'payout.request', 'review.respond', 'promo.item_manage',
  ],
  RESTAURANT_STAFF: [
    'order.view_branch', 'order.update_status', 'item.availability_toggle',
  ],
  DRIVER: [
    'delivery.request_respond', 'delivery.location_update',
    'delivery.update_status', 'earnings.view', 'payout.request',
    'documents.manage',
  ],
  CUSTOMER: [
    'order.place', 'order.track', 'order.cancel', 'review.create',
    'wallet.manage', 'address.manage', 'favorite.manage', 'promo.apply',
    'loyalty.redeem', 'support.raise', 'chat.send',
  ],
};

async function seedSettingsAndCuisines() {
  for (const s of PLATFORM_SETTINGS) {
    await prisma.platformSetting.upsert({
      where: { key: s.key }, update: { value: s.value }, create: s,
    });
  }
  await prisma.platformSetting.upsert({
    where: { key: 'rbac.permissions' },
    update: { value: PERMISSIONS },
    create: { key: 'rbac.permissions', value: PERMISSIONS },
  });
  let order = 0;
  for (const name of CUISINES) {
    await prisma.cuisine.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name), sortOrder: order++ },
    });
  }
}

async function seedStaffUsers() {
  const staff = [
    { role: 'SUPER_ADMIN', email: 'superadmin@quickbite.io', fullName: 'Sam Superadmin' },
    { role: 'ADMIN', email: 'admin@quickbite.io', fullName: 'Ada Admin' },
    { role: 'OPS_MANAGER', email: 'ops@quickbite.io', fullName: 'Oli Ops' },
    { role: 'SUPPORT_AGENT', email: 'support@quickbite.io', fullName: 'Sue Support' },
  ];
  const created = {};
  for (const u of staff) {
    created[u.role] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        ...u, passwordHash: hash(), status: 'ACTIVE',
        isPhoneVerified: true,
        notificationPref: { create: {} },
      },
    });
  }
  return created;
}

async function seedCustomers() {
  const out = [];
  for (const c of CUSTOMERS) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        role: 'CUSTOMER', fullName: c.fullName, email: c.email, phone: c.phone,
        passwordHash: hash(), status: 'ACTIVE', isPhoneVerified: true,
        wallet: { create: { balance: 40.0 } },
        notificationPref: { create: {} },
        addresses: {
          create: [{
            label: 'Home', fullName: c.fullName, phone: c.phone,
            line1: '221B Baker Lane', city: 'New York', country: 'USA',
            postalCode: '10001', lat: CENTER.lat + 0.002, lng: CENTER.lng + 0.001,
            isDefault: true,
          }],
        },
      },
    });
    out.push(user);
  }
  return out;
}

async function seedDrivers() {
  const out = [];
  for (const d of DRIVERS) {
    let user = await prisma.user.findUnique({ where: { email: d.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          role: 'DRIVER', fullName: d.fullName, email: d.email, phone: d.phone,
          passwordHash: hash(), status: 'ACTIVE', isPhoneVerified: true,
          driverProfile: {
            create: {
              vehicleType: d.vehicleType, vehicleModel: d.vehicleModel,
              vehiclePlate: d.vehiclePlate, approvalStatus: 'APPROVED',
              availability: 'ONLINE',
              lastLat: CENTER.lat + 0.001, lastLng: CENTER.lng - 0.001,
              lastSeenAt: new Date(),
            },
          },
        },
      });
    }
    const withProfile = await prisma.user.findUnique({
      where: { id: user.id }, include: { driverProfile: true },
    });
    out.push(withProfile);
  }
  return out;
}

async function seedRestaurants() {
  const results = [];
  for (const r of RESTAURANTS) {
    let owner = await prisma.user.findUnique({ where: { email: r.owner.email } });
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          role: 'RESTAURANT_OWNER', fullName: r.owner.fullName,
          email: r.owner.email, passwordHash: hash(),
          status: r.status === 'APPROVED' ? 'ACTIVE' : 'PENDING',
        },
      });
    }
    let restaurant = await prisma.restaurant.findUnique({ where: { slug: r.slug } });
    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          ownerId: owner.id, name: r.name, slug: r.slug,
          description: r.description, status: r.status,
          cuisines: {
            create: r.cuisines.map((c) => ({ cuisine: { connect: { slug: slugify(c) } } })),
          },
        },
      });
    }
    for (const b of r.branches) {
      const branch = await prisma.branch.create({
        data: {
          restaurantId: restaurant.id, name: b.name,
          addressLine1: b.addressLine1, city: b.city, country: b.country,
          lat: CENTER.lat + b.latOffset, lng: CENTER.lng + b.lngOffset,
          deliveryRadiusKm: b.deliveryRadiusKm, minOrderAmount: b.minOrderAmount,
          deliveryFee: b.deliveryFee, freeDeliveryAbove: b.freeDeliveryAbove,
          prepTimeMinutes: b.prepTimeMinutes, serviceFeePercent: b.serviceFeePercent,
          status: r.status === 'APPROVED' ? 'OPEN' : 'CLOSED',
          hours: {
            create: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
              dayOfWeek: day, openTime: '09:00', closeTime: '23:00',
              isClosed: day === 0 && b.name === 'Midtown',
            })),
          },
        },
      });
      const itemByName = {};
      for (const [ci, cat] of b.categories.entries()) {
        const category = await prisma.menuCategory.create({
          data: { branchId: branch.id, name: cat.name, slot: cat.slot || 'ALL_DAY', sortOrder: ci },
        });
        for (const [ii, it] of cat.items.entries()) {
          const tags = it.tags || {};
          const item = await prisma.menuItem.create({
            data: {
              branchId: branch.id, categoryId: category.id,
              name: it.name, description: it.description,
              price: it.price, prepTimeMinutes: it.prepTimeMinutes || 10,
              isBestSeller: !!it.isBestSeller, isNew: !!it.isNew,
              isVegan: !!tags.isVegan, isVegetarian: !!tags.isVegetarian,
              isSpicy: !!tags.isSpicy, isGlutenFree: !!tags.isGlutenFree,
              sortOrder: ii, slot: cat.slot || 'ALL_DAY',
              variants: it.variants
                ? { create: it.variants.map((v) => ({
                    name: v.name,
                    options: { create: v.options.map((o) => ({
                      label: o.label, priceModifier: o.modifier, isDefault: !!o.isDefault,
                    })) },
                  })) }
                : undefined,
              addOns: it.addOns ? { create: it.addOns.map((a) => ({ name: a.name, price: a.price })) } : undefined,
            },
          });
          itemByName[it.name] = item;
        }
      }
      for (const combo of b.combos || []) {
        const picks = combo.picks.map((n) => itemByName[n]).filter(Boolean);
        if (picks.length) {
          await prisma.combo.create({
            data: {
              branchId: branch.id, name: combo.name, description: combo.description,
              comboPrice: combo.discountTo,
              items: { create: picks.map((p) => ({ itemId: p.id, quantity: 1 })) },
            },
          });
        }
      }
      results.push({ restaurant, branch, itemByName });
    }
  }
  return results;
}

async function seedPromosAndSurge() {
  for (const p of PROMO_CODES) {
    await prisma.promoCode.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code, type: p.type, value: p.value, description: p.description,
        minOrderAmount: p.minOrderAmount, maxDiscount: p.maxDiscount ?? null,
        usageLimit: p.usageLimit, usagePerUser: p.usagePerUser,
        startsAt: new Date(), expiresAt: daysFromNow(p.validDays),
      },
    });
  }
  for (const z of SURGE_ZONES) {
    await prisma.surgeZone.create({
      data: {
        name: z.name, centerLat: CENTER.lat + z.latOffset, centerLng: CENTER.lng + z.lngOffset,
        radiusKm: z.radiusKm, multiplier: z.multiplier, daysOfWeek: z.daysOfWeek,
        isActive: true,
      },
    });
  }
}

async function seedSampleOrders(customers, restaurantData, driverData) {
  const statusPlan = [
    { status: 'DELIVERED', paymentStatus: 'SUCCEEDED', rating: 5 },
    { status: 'DELIVERED', paymentStatus: 'SUCCEEDED', rating: 4 },
    { status: 'OUT_FOR_DELIVERY', paymentStatus: 'PROCESSING', rating: null },
    { status: 'PREPARING', paymentStatus: 'SUCCEEDED', rating: null },
    { status: 'PLACED', paymentStatus: 'PENDING', rating: null },
    { status: 'CANCELLED', paymentStatus: 'REFUNDED', rating: null },
  ];
  let seq = 0;
  for (const plan of statusPlan) {
    const customer = customers[seq % customers.length];
    const { restaurant, branch, itemByName } = restaurantData[seq % restaurantData.length];
    const items = Object.values(itemByName).slice(0, 1 + (seq % 3));
    const itemsTotal = items.reduce((s, i) => s + Number(i.price), 0);
    const total = itemsTotal + Number(branch.deliveryFee) + itemsTotal * 0.05;
    const address = await prisma.address.findFirst({ where: { userId: customer.id } });
    const driver = plan.status === 'OUT_FOR_DELIVERY' || plan.status === 'DELIVERED'
      ? driverData[seq % driverData.length] : null;

    const order = await prisma.order.create({
      data: {
        orderNumber: `QB-${String(100000 + seq)}`,
        customerId: customer.id, branchId: branch.id, addressId: address.id,
        status: plan.status, paymentMethod: seq % 3 === 0 ? 'CASH' : seq % 3 === 1 ? 'CARD' : 'WALLET',
        paymentStatus: plan.paymentStatus,
        itemsTotal, deliveryFee: branch.deliveryFee,
        serviceFee: itemsTotal * 0.05, total,
        commissionAmount: total * 0.15, restaurantEarning: total * 0.85,
        surgeMultiplier: 1,
        dropoffLat: Number(address.lat), dropoffLng: Number(address.lng),
        estimatedDeliveryAt: daysFromNow(0),
        deliveredAt: plan.status === 'DELIVERED' ? new Date() : null,
        restaurantRating: plan.rating,
        driverRating: plan.rating && driver ? Math.max(3, plan.rating - 1) : null,
        cancelledAt: plan.status === 'CANCELLED' ? new Date() : null,
        cancelReason: plan.status === 'CANCELLED' ? 'Changed my mind' : null,
        items: {
          create: items.map((i) => ({
            menuItemId: i.id, nameSnapshot: i.name, priceSnapshot: i.price,
            quantity: 1, lineTotal: i.price,
          })),
        },
        statusLogs: {
          create: [{ status: 'PLACED', note: 'Seed' }, ...(plan.status !== 'PLACED' ? [{ status: plan.status, note: 'Seed' }] : [])],
        },
        payments: {
          create: [{
            customerId: customer.id,
            method: seq % 3 === 0 ? 'CASH' : seq % 3 === 1 ? 'CARD' : 'WALLET',
            status: plan.paymentStatus, amount: total,
            paidAt: plan.paymentStatus === 'SUCCEEDED' ? new Date() : null,
          }],
        },
        delivery: driver || plan.status === 'OUT_FOR_DELIVERY' ? {
          create: {
            branchId: branch.id,
            driverId: driver ? driver.driverProfile.id : null,
            status: plan.status,
            pickupLat: Number(branch.lat), pickupLng: Number(branch.lng),
            dropoffLat: Number(address.lat), dropoffLng: Number(address.lng),
            distanceKm: 2.4, baseFee: 2.0, distanceBonus: 1.92,
            driverEarning: 3.92, platformCut: 0.0, assignedAt: new Date(),
          },
        } : undefined,
      },
    });

    // Loyalty + review for delivered orders
    if (plan.status === 'DELIVERED') {
      await prisma.loyaltyTransaction.create({
        data: { userId: customer.id, orderId: order.id, type: 'DEPOSIT', points: Math.round(total), balanceAfter: Math.round(total) },
      });
      if (plan.rating) {
        await prisma.review.create({
          data: {
            authorId: customer.id, restaurantId: restaurant.id, branchId: branch.id,
            orderId: order.id, driverId: driver ? driver.driverProfile.id : null,
            type: 'restaurant', rating: plan.rating,
            comment: 'Solid food, fast delivery. (seed review)',
          },
        });
      }
    }
    seq += 1;
  }
}

async function main() {
  console.log('Seeding Food Delivery Platform…');
  await seedSettingsAndCuisines();
  await seedStaffUsers();
  const customers = await seedCustomers();
  const drivers = await seedDrivers();
  const restaurantData = await seedRestaurants();
  await seedPromosAndSurge();
  await seedSampleOrders(customers, restaurantData, drivers);
  console.log('Seed complete.');
  console.log(`Demo login password for ALL seeded accounts: ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
