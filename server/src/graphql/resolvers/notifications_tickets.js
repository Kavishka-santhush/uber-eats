const prisma = require('../../config/prisma');
const { requireAuth, requireRole } = require('../../lib/roles');
const { paginate, num, ticketNumber } = require('../../lib/misc');
const { notify } = require('../../domain/notification');
const wallet = require('../../domain/wallet');
const payments = require('../../domain/payments');

/** Notifications, favorites, support tickets, chatbot. */

module.exports = {
  Query: {
    notifications: async (_p, args, ctx) => {
      const user = requireAuth(ctx);
      const { take, skip } = paginate(args);
      const where = { userId: user.id, ...(args.onlyUnread ? { isRead: false } : {}) };
      const [items, total, unread] = await Promise.all([
        prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        prisma.notification.count({ where: { userId: user.id } }),
        prisma.notification.count({ where: { userId: user.id, isRead: false } }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take), unread };
    },
    unreadCount: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      return prisma.notification.count({ where: { userId: user.id, isRead: false } });
    },
    myTickets: async (_p, args, ctx) => {
      const user = requireAuth(ctx);
      const { take, skip } = paginate(args);
      const where = { creatorId: user.id };
      const [items, total] = await Promise.all([
        prisma.ticket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { messages: { include: { author: true }, orderBy: { createdAt: 'asc' } }, order: true, creator: true } }),
        prisma.ticket.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    tickets: async (_p, args, ctx) => {
      const user = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const { take, skip } = paginate(args, 100);
      const where = {
        ...(args.status ? { status: args.status } : {}),
        ...(args.assignedToMe ? { assignedToId: user.id } : {}),
        ...(args.search ? { OR: [{ subject: { contains: args.search, mode: 'insensitive' } }, { number: { contains: args.search, mode: 'insensitive' } }] } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.ticket.findMany({ where, skip, take, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], include: { creator: true, order: true, assignedTo: true, messages: { include: { author: true } } } }),
        prisma.ticket.count({ where }),
      ]);
      return { items, total, page: args.page || 1, pages: Math.ceil(total / take) };
    },
    ticket: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      const t = await prisma.ticket.findUnique({ where: { id }, include: { messages: { include: { author: true }, orderBy: { createdAt: 'asc' } }, order: { include: { branch: { include: { restaurant: true } }, customer: true, delivery: { include: { driver: { include: { user: true } } } } } }, creator: true, assignedTo: true } });
      if (t.creatorId !== user.id && !['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT'].includes(user.role)) {
        throw Object.assign(new Error('Forbidden'), { extensions: { code: 'FORBIDDEN' } });
      }
      return t;
    },
    chatbotSuggest: async (_p, { orderId }, ctx) => {
      requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { statusLogs: true } });
      const map = {
        PLACED: ['Where is my order?', 'Cancel this order', 'Change delivery address'],
        PREPARING: ['How long will it take?', 'Add special instructions', 'Cancel this order'],
        OUT_FOR_DELIVERY: ['Track my driver', 'Contact the driver', 'I have a delivery issue'],
        DELIVERED: ['Report a problem with my order', 'Request a refund', 'Leave a review'],
      };
      return map[order?.status] || ['Help with my order', 'Contact support'];
    },
  },

  Mutation: {
    markNotificationRead: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
      return true;
    },
    markAllNotificationsRead: async (_p, _a, ctx) => {
      const user = requireAuth(ctx);
      await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
      return true;
    },
    deleteNotification: async (_p, { id }, ctx) => {
      const user = requireAuth(ctx);
      await prisma.notification.deleteMany({ where: { id, userId: user.id } });
      return true;
    },

    toggleFavoriteRestaurant: async (_p, { restaurantId }, ctx) => {
      const user = requireAuth(ctx);
      const existing = await prisma.favorite.findFirst({ where: { userId: user.id, restaurantId, menuItemId: null } });
      if (existing) { await prisma.favorite.delete({ where: { id: existing.id } }); return null; }
      const fav = await prisma.favorite.create({ data: { userId: user.id, restaurantId }, include: { restaurant: true } });
      return { ...fav, item: null };
    },
    toggleFavoriteItem: async (_p, { menuItemId }, ctx) => {
      const user = requireAuth(ctx);
      const existing = await prisma.favorite.findFirst({ where: { userId: user.id, menuItemId } });
      if (existing) { await prisma.favorite.delete({ where: { id: existing.id } }); return null; }
      const fav = await prisma.favorite.create({ data: { userId: user.id, menuItemId }, include: { item: true } });
      return { ...fav, restaurant: null };
    },

    raiseTicket: async (_p, { input }, ctx) => {
      const user = requireAuth(ctx);
      let aiClass = null;
      try {
        const ai = require('../../services/openrouter');
        aiClass = await ai.classifyTicket(input.subject, input.description);
      } catch { /* optional */ }
      const ticket = await prisma.ticket.create({
        data: {
          number: ticketNumber(), creatorId: user.id, subject: input.subject, description: input.description,
          orderId: input.orderId || null,
          category: input.category || (aiClass?.category) || 'OTHER',
          aiCategory: aiClass?.category || null,
          priority: aiClass?.priority || 3,
          messages: { create: { authorId: user.id, body: input.description } },
        },
        include: { messages: { include: { author: true } } },
      });
      const agents = await prisma.user.findMany({ where: { role: { in: ['SUPPORT_AGENT', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true } });
      await notify(agents.map((a) => a.id).slice(0, 20), { title: `New ticket ${ticket.number}`, body: input.subject, category: 'system' });
      return ticket;
    },
    replyTicket: async (_p, { ticketId, body }, ctx) => {
      const user = requireAuth(ctx);
      const isStaff = ['SUPPORT_AGENT', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);
      const msg = await prisma.ticketMessage.create({ data: { ticketId, authorId: user.id, body, isStaff }, include: { author: true } });
      const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (isStaff) await notify(t.creatorId, { title: `Support replied to ${t.number}`, body });
      return msg;
    },
    resolveTicket: async (_p, { input }, ctx) => {
      const actor = requireRole(ctx, 'SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT');
      const t = await prisma.ticket.findUnique({ where: { id: input.ticketId }, include: { order: true } });
      const data = { status: input.status, resolution: input.resolution || null };
      if (input.refundAmount != null) data.refundAmount = input.refundAmount;
      if (input.walletCredit != null) data.walletCredit = input.walletCredit;
      const ticket = await prisma.ticket.update({ where: { id: input.ticketId }, data, include: { messages: { include: { author: true } } } });
      // resolution actions
      if (input.refundAmount > 0 && t.orderId) {
        await payments.cancelAndRefund(t.order, { reason: input.resolution || 'support refund', cancelledBy: actor.id, amount: input.refundAmount, partial: num(input.refundAmount) < num(t.order.total) });
      }
      if (input.walletCredit > 0) {
        await wallet.creditWallet(t.creatorId, input.walletCredit, 'ADMIN_ADJUSTMENT', t.id, `Support credit ${t.number}`);
      }
      await notify(t.creatorId, { title: `Ticket ${t.number} ${input.status.toLowerCase()}`, body: input.resolution || '', email: true });
      return ticket;
    },
    assignTicket: async (_p, { ticketId, agentId }, ctx) => {
      requireRole(ctx, 'SUPER_ADMIN', 'ADMIN');
      return prisma.ticket.update({ where: { id: ticketId }, data: { assignedToId: agentId, status: 'IN_PROGRESS' }, include: { assignedTo: true } });
    },
    askChatbot: async (_p, { orderId, message }, ctx) => {
      requireAuth(ctx);
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { statusLogs: true, branch: { include: { restaurant: true } } } });
      const summary = order ? `Order ${order.orderNumber} (${order.branch.restaurant.name}) status: ${order.status}` : 'no order';
      const ai = require('../../services/openrouter');
      const reply = await ai.supportChatbot({ orderSummary: summary }, [{ role: 'user', content: message }]);
      return reply || 'A support agent will be with you shortly. You can raise a ticket for a human reply.';
    },
  },

  Notification: { data: (n) => n.data },
  Ticket: {
    creator: (t) => (t.creator || prisma.user.findUnique({ where: { id: t.creatorId } })),
    order: (t) => (t.order || (t.orderId ? prisma.order.findUnique({ where: { id: t.orderId }, include: { branch: { include: { restaurant: true } } } }) : null)),
    assignedTo: (t) => (t.assignedTo || (t.assignedToId ? prisma.user.findUnique({ where: { id: t.assignedToId } }) : null)),
    messages: (t) => (t.messages || prisma.ticketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' }, include: { author: true } })),
  },
};
