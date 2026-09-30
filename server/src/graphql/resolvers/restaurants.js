const prisma = require('../../config/prisma');
const { requireAuth, requireRole, requireGroup, assertBranchAccess, assertRestaurantAccess } = require('../../lib/roles');
const { paginate, slugify, num } = require('../../lib/misc');
const { haversineKm, estimateDriveMinutes } = require('../../lib/haversine');
const { audit } = require('../../services/settings');
const { isOpenNowFromHours } = require('./_helpers');

/** Cuisines, restaurants, branches, menu management. */

module.exports = {
  Query: {
    cuisines: () => prisma.cuisine.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),

    restaurants: async (_p, { filters = {} }) => {
      const { take, skip } = paginate(filters, 50);
      const where = { status: 'APPROVED' };
      if (filters.featured) where.isFeatured = true;
      if (filters.cuisineId) where.cuisines = { some: { cuisineId: filters.cuisineId } };
      if (filters.minRating) where.avgRating = { gte: filters.minRating };
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { items: { some: { name: { contains: filters.search, mode: 'insensitive' } } } },
        ];
      }
      const dietary = filters.dietary || [];
      if (dietary.length) {
        const flagMap = { vegan: 'isVegan', vegetarian: 'isVegetarian', spicy: 'isSpicy', gluten_free: 'isGlutenFree' };
        where.items = {
          some: { OR: dietary.map((d) => ({ [flagMap[d.toLowerCase()]]: true })).filter((c) => Object.values(c)[0] !== undefined) },
        };
      }
      let items = await prisma.restaurant.findMany({
        where, skip, take,
        orderBy: filters.sort === 'rating' ? { avgRating: 'desc' }
          : filters.sort === 'popularity' ? { totalOrders: 'desc' }
          : filters.sort === 'distance' ? { createdAt: 'desc' }
          : [{ isFeatured: 'desc' }, { avgRating: 'desc' }],
        include: { cuisines: { include: { cuisine: true } }, branches: { include: { hours: true } } },
      });

      // geo filtering + distance/ETA annotation
      if (filters.lat != null && filters.lng != null) {
        const point = { lat: filters.lat, lng: filters.lng };
        items = items.map((r) => {
          const nearest = r.branches
            .map((b) => ({ b, d: haversineKm(point, { lat: num(b.lat), lng: num(b.lng) }) }))
            .sort((x, y) => x.d - y.d)[0];
          if (!nearest) return { ...r, distanceKm: null, minDeliveryTimeMin: null };
          if (filters.near && nearest.d > num(nearest.b.deliveryRadiusKm)) return null;
          const minTime = nearest.b.prepTimeMinutes + estimateDriveMinutes(nearest.d);
          if (filters.maxDeliveryTimeMin && minTime > filters.maxDeliveryTimeMin) return null;
          if (filters.maxMinOrder != null && num(nearest.b.minOrderAmount) > filters.maxMinOrder) return null;
          return { ...r, distanceKm: Math.round(nearest.d * 10) / 10, minDeliveryTimeMin: minTime };
        }).filter(Boolean);
        if (filters.sort === 'distance') items.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
        if (filters.sort === 'delivery_time') items.sort((a, b) => (a.minDeliveryTimeMin ?? 999) - (b.minDeliveryTimeMin ?? 999));
      }
      if (filters.openNow) {
        items = items.filter((r) => r.branches.some((b) => b.isOpenNow || isOpenNowFromHours(b.hours)));
      }
      const total = await prisma.restaurant.count({ where });
      return { items, total, page: filters.page || 1, pages: Math.ceil(total / take) };
    },

    restaurant: (_p, { id }) => prisma.restaurant.findUnique({ where: { id } }),
    restaurantBySlug: (_p, { slug }) => prisma.restaurant.findUnique({ where: { slug } }),
    branchesForRestaurant: (_p, { restaurantId }) => prisma.branch.findMany({ where: { restaurantId } }),
    branch: (_p, { id }) => prisma.branch.findUnique({ where: { id } }),

    branchMenu: async (_p, { branchId, slot }) => {
      const now = new Date();
      const hour = now.getHours();
      const activeSlot = slot || slotForHour(hour);
      const cats = await prisma.menuCategory.findMany({
        where: {
          branchId, isActive: true,
          OR: [{ slot: 'ALL_DAY' }, ...(slot ? [{ slot }] : [{ slot: activeSlot }, { slot: 'ALL_DAY' }])],
        },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: {
              OR: [{ slot: 'ALL_DAY' }, ...(slot ? [{ slot }] : [{ slot: activeSlot }, { slot: 'ALL_DAY' }])],
            },
            orderBy: { sortOrder: 'asc' },
            include: { variants: { include: { options: { orderBy: { sortOrder: 'asc' } } } }, addOns: true },
          },
        },
      });
      return cats.filter((c) => c.items.length);
    },

    searchFood: async (_p, { query, page, limit }) => {
      const { take, skip } = paginate({ page, limit });
      const where = {
        availability: 'AVAILABLE',
        branch: { status: 'OPEN', restaurant: { status: 'APPROVED' } },
        OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }],
      };
      const [items, total] = await Promise.all([
        prisma.menuItem.findMany({ where, skip, take, include: { branch: { include: { restaurant: true } } } }),
        prisma.menuItem.count({ where }),
      ]);
      return { items, total, page: page || 1, pages: Math.ceil(total / take) };
    },

    trendingRestaurants: (_p, { limit = 10 }) => prisma.restaurant.findMany({
      where: { status: 'APPROVED' }, orderBy: [{ totalOrders: 'desc' }, { avgRating: 'desc' }], take: limit,
      include: { branches: true, cuisines: { include: { cuisine: true } } },
    }),

    trendingDishes: (_p, { limit = 10 }) => prisma.menuItem.findMany({
      where: { availability: 'AVAILABLE', branch: { restaurant: { status: 'APPROVED' } } },
      orderBy: [{ isBestSeller: 'desc' }, { orderItems: { _count: 'desc' } }],
      take: limit, include: { branch: { include: { restaurant: true } } },
    }),

    recommendedForMe: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      const history = await prisma.order.findMany({
        where: { customerId: user.id },
        include: { items: true, branch: { include: { restaurant: true } } },
        take: 20, orderBy: { createdAt: 'desc' },
      });
      const ai = require('../../services/openrouter');
      const summary = history.map((o) =>
        `${o.branch.restaurant.name}: ${o.items.map((i) => i.nameSnapshot).join(', ')}`).join('\n') || 'no history';
      const rec = await ai.recommend(summary);
      const names = (rec.restaurants || []).concat(rec.dishes || []);
      const matched = await prisma.restaurant.findMany({
        where: { status: 'APPROVED', OR: names.map((n) => ({ name: { contains: n, mode: 'insensitive' } })) },
        take: 10, include: { branches: true },
      });
      const fallback = matched.length ? matched : await prisma.restaurant.findMany({
        where: { status: 'APPROVED' }, orderBy: { avgRating: 'desc' }, take: 10, include: { branches: true },
      });
      return fallback;
    },
  },

  Mutation: {
    updateRestaurantProfile: async (_p, { id, input }, ctx) => {
      const user = requireRole(ctx, 'RESTAURANT_OWNER', 'SUPER_ADMIN', 'ADMIN');
      await assertRestaurantAccess(user, id);
      const { cuisineIds, ...rest } = input;
      return prisma.restaurant.update({
        where: { id },
        data: { ...rest, cuisines: cuisineIds ? { deleteMany: {}, create: cuisineIds.map((cid) => ({ cuisineId: cid })) } : undefined },
      });
    },

    submitRestaurantForApproval: async (_p, { input, docs = {} }, ctx) => {
      const user = requireRole(ctx, 'RESTAURANT_OWNER');
      const restaurant = await prisma.restaurant.findFirst({ where: { ownerId: user.id } });
      if (!restaurant) throw Object.assign(new Error('No restaurant'), { extensions: { code: 'BAD_USER_INPUT' } });
      const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true } });
      const { notifyMany } = require('../../domain/notification');
      await notifyMany(admins.map((a) => a.id), { title: 'Restaurant update for review', body: restaurant.name, category: 'system' });
      return prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          ...input, status: 'PENDING_APPROVAL',
          licenseDocUrl: docs.licenseDocUrl || restaurant.licenseDocUrl,
          foodSafetyUrl: docs.foodSafetyUrl || restaurant.foodSafetyUrl,
        },
      });
    },

    addBranch: async (_p, { restaurantId, input }, ctx) => {
      const user = requireRole(ctx, 'RESTAURANT_OWNER', 'SUPER_ADMIN', 'ADMIN');
      await assertRestaurantAccess(user, restaurantId);
      const branch = await prisma.branch.create({
        data: {
          restaurantId,
          hours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: '09:00', closeTime: '22:00' })) },
          ...input,
        },
      });
      return prisma.branch.findUnique({ where: { id: branch.id }, include: { hours: true } });
    },
    updateBranch: async (_p, { id, input }, ctx) => {
      const user = requireAuth(ctx);
      const b = await prisma.branch.findUnique({ where: { id } });
      await assertRestaurantAccess(user, b.restaurantId);
      return prisma.branch.update({ where: { id }, data: input });
    },
    setBranchStatus: async (_p, { id, status }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, id);
      return prisma.branch.update({ where: { id }, data: { status, isOpenNow: status === 'OPEN' } });
    },
    setBranchHours: async (_p, { branchId, hours }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      await prisma.operatingHour.deleteMany({ where: { branchId } });
      await prisma.operatingHour.createMany({ data: hours.map((h) => ({ branchId, ...h })) });
      return prisma.branch.findUnique({ where: { id: branchId }, include: { hours: true } });
    },
    addBranchStaff: async (_p, { branchId, email }, ctx) => {
      const user = requireRole(ctx, 'RESTAURANT_OWNER', 'ADMIN', 'SUPER_ADMIN');
      const b = await prisma.branch.findUnique({ where: { id: branchId }, include: { restaurant: true } });
      if (b.restaurant.ownerId !== user.id && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      }
      const staff = await prisma.user.findFirst({ where: { email, role: 'RESTAURANT_STAFF' } });
      if (!staff) throw Object.assign(new Error('Staff user with that email not found'), { extensions: { code: 'BAD_USER_INPUT' } });
      await prisma.branchStaff.upsert({ where: { userId_branchId: { userId: staff.id, branchId } }, create: { userId: staff.id, branchId }, update: {} });
      return staff;
    },

    // ---- menu CRUD ----
    createMenuCategory: async (_p, { branchId, input }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      return prisma.menuCategory.create({ data: { branchId, ...input } });
    },
    updateMenuCategory: async (_p, { id, input }, ctx) => {
      const user = requireAuth(ctx);
      const c = await prisma.menuCategory.findUnique({ where: { id } });
      await assertBranchAccess(user, c.branchId);
      return prisma.menuCategory.update({ where: { id }, data: input });
    },
    deleteMenuCategory: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const c = await prisma.menuCategory.findUnique({ where: { id } });
      await assertBranchAccess(user, c.branchId);
      await prisma.menuCategory.delete({ where: { id } });
      return true;
    },
    reorderMenuCategories: async (_p, { branchId, orderedIds }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      await prisma.$transaction(orderedIds.map((cid, i) =>
        prisma.menuCategory.update({ where: { id: cid }, data: { sortOrder: i } })));
      return prisma.menuCategory.findMany({ where: { branchId }, orderBy: { sortOrder: 'asc' } });
    },

    createMenuItem: async (_p, { branchId, input }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      const { variants = [], addOns = [], imageUrls, ...rest } = input;
      return prisma.menuItem.create({
        data: {
          branchId, ...rest, imageUrls: imageUrls || [],
          variants: { create: variants.map((v) => ({ name: v.name, optionType: v.optionType, sortOrder: v.sortOrder, options: { create: v.options.map((o) => ({ label: o.label, priceModifier: o.priceModifier || 0, isDefault: !!o.isDefault })) } })) },
          addOns: { create: addOns.map((a) => ({ name: a.name, price: a.price, isRequired: !!a.isRequired })) },
        },
        include: { variants: { include: { options: true } }, addOns: true },
      });
    },
    updateMenuItem: async (_p, { id, input }, ctx) => {
      const user = requireAuth(ctx);
      const it = await prisma.menuItem.findUnique({ where: { id } });
      await assertBranchAccess(user, it.branchId);
      const data = { ...input };
      delete data.variants; delete data.addOns; // structural edits via dedicated flow
      return prisma.menuItem.update({ where: { id }, data });
    },
    deleteMenuItem: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const it = await prisma.menuItem.findUnique({ where: { id } });
      await assertBranchAccess(user, it.branchId);
      await prisma.menuItem.delete({ where: { id } });
      return true;
    },
    setMenuItemAvailability: async (_p, { id, availability }, ctx) => {
      const user = requireAuth(ctx);
      const it = await prisma.menuItem.findUnique({ where: { id } });
      await assertBranchAccess(user, it.branchId);
      return prisma.menuItem.update({ where: { id }, data: { availability } });
    },
    bulkSetMenuAvailability: async (_p, { ids, availability }, ctx) => {
      const user = requireAuth(ctx);
      const res = await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: { availability } });
      await audit({ userId: user.id, action: 'menu.bulk_availability', entity: 'menuitem', meta: { ids, availability }, ip: ctx.req?.ip });
      return res.count;
    },
    bulkCreateMenuItems: async (_p, { branchId, items }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      let n = 0;
      for (const it of items) {
        const { variants = [], addOns = [], ...rest } = it;
        await prisma.menuItem.create({
          data: {
            branchId, ...rest,
            variants: { create: variants.map((v) => ({ name: v.name, options: { create: v.options.map((o) => ({ label: o.label, priceModifier: o.priceModifier || 0, isDefault: !!o.isDefault })) } })) },
            addOns: { create: addOns.map((a) => ({ name: a.name, price: a.price })) },
          },
        });
        n += 1;
      }
      return n;
    },

    createCombo: async (_p, { branchId, input }, ctx) => {
      const user = requireAuth(ctx);
      await assertBranchAccess(user, branchId);
      const { itemIds, ...rest } = input;
      return prisma.combo.create({
        data: { branchId, ...rest, items: { create: itemIds.map((itemId) => ({ itemId, quantity: 1 })) } },
        include: { items: { include: { item: true } } },
      });
    },
    deleteCombo: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const c = await prisma.combo.findUnique({ where: { id } });
      await assertBranchAccess(user, c.branchId);
      await prisma.combo.delete({ where: { id } });
      return true;
    },

    generateItemDescription: async (_p, { name, notes }, ctx) => {
      requireAuth(ctx);
      const ai = require('../../services/openrouter');
      return ai.generateMenuDescription(name, notes);
    },

    // ---- admin ----
    adminSetRestaurantStatus: async (_p, { id, status, reason }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const r = await prisma.restaurant.findUnique({ where: { id }, include: { owner: true } });
      const updated = await prisma.restaurant.update({ where: { id }, data: { status, rejectionReason: reason || null } });
      if (status === 'APPROVED') await prisma.user.update({ where: { id: r.ownerId }, data: { status: 'ACTIVE' } });
      const { notify: n } = require('../../domain/notification');
      await n(r.ownerId, {
        title: status === 'APPROVED' ? 'Restaurant approved 🎉' : `Restaurant ${status.toLowerCase()}`,
        body: status === 'REJECTED' ? (reason || 'See dashboard') : r.name,
        email: true, category: 'system',
      });
      await audit({ userId: actor.id, action: `restaurant.${status.toLowerCase()}`, entity: 'restaurant', entityId: id, ip: ctx.req?.ip });
      return updated;
    },
    adminFeatureRestaurant: async (_p, { id, featured, until }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const r = await prisma.restaurant.update({ where: { id }, data: { isFeatured: featured, featuredUntil: until ? new Date(until) : null } });
      await audit({ userId: actor.id, action: `restaurant.feature.${featured}`, entity: 'restaurant', entityId: id });
      return r;
    },
    adminSetCommission: async (_p, { id, percent }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN');
      return prisma.restaurant.update({ where: { id }, data: { commissionRate: percent } });
    },
    adminCreateCuisine: async (_p, { name, iconUrl }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      return prisma.cuisine.create({ data: { name, slug: slugify(name), iconUrl } });
    },
    adminUpdateCuisine: async (_p, args, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      const { id, ...data } = args;
      return prisma.cuisine.update({ where: { id }, data });
    },
  },

  // ---- field resolvers ----
  Restaurant: {
    owner: (r) => prisma.user.findUnique({ where: { id: r.ownerId } }),
    cuisines: (r) => prisma.restaurantCuisine.findMany({ where: { restaurantId: r.id }, include: { cuisine: true } }).then((x) => x.map((c) => c.cuisine)),
    branches: (r, _a, ctx) => ctx.loaders.branchesByRestaurant.load(r.id),
    reviews: async (r, args) => {
      const { take, skip } = paginate(args);
      const where = { restaurantId: r.id, type: 'restaurant' };
      const [items, total] = await Promise.all([
        prisma.review.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { author: true, response: { include: { user: true } } } }),
        prisma.review.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
  },
  RestaurantCuisine: { cuisine: (rc) => rc.cuisine },
  Cuisine: {
    restaurantCount: (c) => prisma.restaurantCuisine.count({ where: { cuisineId: c.id } }),
  },
  Branch: {
    restaurant: (b) => prisma.restaurant.findUnique({ where: { id: b.restaurantId } }),
    hours: (b, _a, ctx) => ctx.loaders.hoursByBranch.load(b.id),
    categories: (b) => prisma.menuCategory.findMany({ where: { branchId: b.id }, orderBy: { sortOrder: 'asc' } }),
    combos: (b) => prisma.combo.findMany({ where: { branchId: b.id }, include: { items: { include: { item: true } } } }),
  },
  MenuCategory: {
    items: (c, args) => prisma.menuItem.findMany({
      where: { categoryId: c.id, ...(args.availability ? { availability: args.availability } : {}) },
      orderBy: { sortOrder: 'asc' },
      include: { variants: { include: { options: true } }, addOns: true },
    }),
  },
  MenuItem: {
    tags: (i) => [i.isVegan && 'Vegan', i.isVegetarian && 'Vegetarian', i.isSpicy && 'Spicy', i.isGlutenFree && 'Gluten-Free', i.isBestSeller && 'Best Seller', i.isNew && 'New'].filter(Boolean),
    restaurantName: async (i) => {
      const b = await prisma.branch.findUnique({ where: { id: i.branchId }, include: { restaurant: true } });
      return b?.restaurant?.name || null;
    },
  },
  Combo: { items: (c) => prisma.comboItem.findMany({ where: { comboId: c.id }, include: { item: true } }) },
  ComboItem: { item: (ci) => ci.item || prisma.menuItem.findUnique({ where: { id: ci.itemId } }) },
};

/** Time-based menu slot auto-switch. */
function slotForHour(h) {
  if (h >= 5 && h < 11) return 'BREAKFAST';
  if (h >= 11 && h < 16) return 'LUNCH';
  if (h >= 16 && h < 23) return 'DINNER';
  return 'ALL_DAY';
}
