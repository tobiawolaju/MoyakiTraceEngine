import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { WsHub } from './services/wsHub.js';
import { RpcManager } from './managers/rpcManager.js';
import { FirebaseManager } from './managers/firebaseManager.js';
import { ReorgManager } from './managers/reorgManager.js';
import { IngestionManager } from './managers/ingestionManager.js';

const metrics = {
  startedAt: Date.now(),
  blocksProcessed: 0,
  rpcErrors: 0,
  firebaseErrors: 0,
  rateLimitEvents: 0,
  reorgCount: 0,
  backpressurePauses: 0,
  apiRequests: 0
};

function log(event, payload = {}) {
  console.log(JSON.stringify({ level: 'info', event, ts: new Date().toISOString(), ...payload }));
}

function parseNumber(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

async function bootstrap() {
  const firebaseManager = new FirebaseManager();
  firebaseManager.initFirebase();
  await firebaseManager.verifyDatabaseConnection();
  log('firebase.ready');

  const rpcManager = new RpcManager(config.nodes, metrics);
  const reorgManager = new ReorgManager({
    windowSize: config.ingestion.lastBlocksWindow,
    metrics,
    onRollback: async (_nodeId, fromHeight, toHeight) => {
      try {
        await firebaseManager.rollbackBlocks(fromHeight, toHeight);
      } catch (error) {
        metrics.firebaseErrors += 1;
        log('firebase.rollback.error', { message: error.message, fromHeight, toHeight });
      }
    }
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  // We listen before awaiting ingestion.startIngestion() to satisfy Cloud Run health checks.
  server.listen(config.port, '0.0.0.0', () => {
    log('server.ready', { url: `http://0.0.0.0:${config.port}`, port: config.port });
  });

  await ingestionManager.startIngestion();
  log('ingestion.started', { nodes: config.nodes.map((n) => n.nodeId) });

  const metricTimer = setInterval(() => {
    log('metrics.minute', {
      blocksProcessedPerMinute: metrics.blocksProcessed,
      rpcErrors: metrics.rpcErrors,
      queueDepth: Object.fromEntries(
        [...ingestionManager.blockQueues.entries()].map(([nodeId, q]) => [nodeId, q.depth])
      ),
      traceQueueDepth: ingestionManager.traceQueue.depth,
      rateLimitEvents: metrics.rateLimitEvents,
      reorgCount: metrics.reorgCount
    });
    metrics.blocksProcessed = 0;
  }, config.metricsLogIntervalMs);

  const shutdown = () => {
    clearInterval(metricTimer);
    ingestionManager.stop();
    rpcManager.close();
    wsHub.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('BOOTSTRAP_FATAL_ERROR:', error);
  console.error(JSON.stringify({ 
    level: 'error', 
    event: 'bootstrap.failed', 
    message: error.message,
    stack: error.stack
  }));
  process.exit(1);
});
