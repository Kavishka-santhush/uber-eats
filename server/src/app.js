const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');

const env = require('./config/env');
const logger = require('./config/logger');
const { typeDefs } = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');
const { createContext } = require('./graphql/context');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const { stripeWebhookHandler } = require('./routes/stripeWebhook');

/**
 * Build the fully-wired Express app (GraphQL + REST + static uploads).
 * Returned ready-to-listen; the HTTP server / sockets / jobs are attached in
 * index.js so this stays testable in isolation.
 */
async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: true, credentials: true }));

  // 1) Stripe webhook FIRST — needs the raw body bytes for signature checks,
  //    so it must run before the global JSON body parser.
  app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

  // 2) General body parsing.
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 3) Serve locally-stored uploads (Multer writes here).
  const uploadRoot = path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.join(process.cwd(), env.UPLOAD_DIR);
  app.use('/uploads', express.static(uploadRoot));

  // 4) Health check.
  app.get('/health', (_req, res) => res.json({
    ok: true, service: 'fooddelivery-server', env: env.NODE_ENV, uptime: process.uptime(),
  }));

  // 5) REST routes.
  const restLimiter = rateLimit({ windowMs: 15 * 60_000, max: 600, standardHeaders: true, legacyHeaders: false });
  app.use('/auth', restLimiter, authRoutes);
  app.use('/upload', restLimiter, uploadRoutes);

  // 6) GraphQL.
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: !env.isProd,
    formatError: (formatted, err) => {
      const cause = err?.extensions?.exception;
      if (cause?.name === 'PrismaClientKnownRequestError') {
        logger.error(`prisma error ${cause.code}: ${cause.meta?.target || ''}`);
        if (env.isProd) return { message: 'Database error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
      }
      if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR' && env.isProd) {
        logger.error(formatted.message);
        return { ...formatted, message: 'Internal server error' };
      }
      return formatted;
    },
  });
  await server.start();

  const gqlLimiter = rateLimit({ windowMs: 60_000, max: 1000, standardHeaders: true, legacyHeaders: false });
  app.use(
    '/graphql',
    gqlLimiter,
    expressMiddleware(server, { context: async ({ req }) => createContext({ req }) }),
  );

  // 7) 404 fallback.
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  return { app, apolloServer: server };
}

module.exports = { createApp };
