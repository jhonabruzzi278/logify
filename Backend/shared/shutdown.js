function gracefulShutdown(server, pool, sqs, serviceName) {
  const pools = Array.isArray(pool) ? pool : [pool];
  const shutdown = async (signal) => {
    console.log(`${serviceName}: ${signal} received, shutting down...`);
    server.close(() => console.log(`${serviceName}: HTTP server closed`));
    await Promise.all(pools.filter(Boolean).map((p) => p.end().catch(() => {})));
    if (sqs) sqs.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { gracefulShutdown };
