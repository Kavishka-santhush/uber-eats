const fs = require('fs');
const path = require('path');
const http = require('http');

const env = require('./config/env');
const logger = require('./config/logger');
const prisma = require('./config/prisma');
const { createApp } = require('./app');
const hub = require('./realtime/hub');
const { registerSocketHandlers } = require('./realtime/socket');
const ticker = require('./jobs/ticker');
const settings = require('./services/settings');

/**
 * Process entrypoint: builds the Express app, attaches the HTTP server,
 * boots Socket.io (auth handshake + event handlers), ensures the local
 * uploads directory, warms the settings cache and starts the job ticker.
 */
async function main() {
  const { app } = await createApp();
  const server = http.createServer(app);

  const io = hub.init(server, { origin: env.CLIENT_WEB_ORIGIN });
  registerSocketHandlers(io);

  // Ensure the local uploads root exists before the first request.
  const uploadRoot = path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.join(process.cwd(), env.UPLOAD_DIR);
  fs.mkdirSync(uploadRoot, { recursive: true });

  await settings.refreshCache().catch((e) => logger.error(`settings cache refresh failed: ${e.message}`));
  ticker.start();

  server.listen(env.PORT, () => {
    logger.info(`🚀 fooddelivery-server up on :${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`   GraphQL  -> http://localhost:${env.PORT}/graphql`);
    logger.info(`   REST     -> /auth/refresh, /auth/logout, /upload/:scope, /webhook/stripe`);
    logger.info(`   Sockets  -> ws://localhost:${env.PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — graceful shutdown`);
    server.close();
    io.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
  process.on('unhandledRejection', (reason) => logger.error(`unhandledRejection: ${reason}`));
  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.stack || err.message}`);
  });
}

main().catch((err) => {
  logger.error(`boot failed: ${err.stack || err.message}`);
  process.exit(1);
});
