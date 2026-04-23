import { Hono } from 'hono';
import { logger } from './logger';

const app = new Hono();

// JSON log once per module init (Workers may cold-start)
logger.info('server.init');

// Minimal request logger to JSON for platform parsing
app.use('*', async (c, next) => {
  logger.info('request', { method: c.req.method, path: c.req.path });
  await next();
});

// Minimal API routes. Only /api/* is routed to the worker first via wrangler config
app.get('/api/health', (c) => c.json({ success: true, data: { status: 'healthy', ts: new Date().toISOString() } }));

// Catch-all for other /api/* to return JSON 404
app.all('/api/*', (c) => c.json({ success: false, error: 'Not Found' }, 404));

app.notFound((c) => {
  logger.warn('not_found', { path: c.req.path });
  return c.json({ success: false, error: 'Not Found' }, 404);
});

app.onError((err, c) => {
  logger.error('unhandled_error', { path: c.req.path, error: String(err) });
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

export default {
  fetch: app.fetch,
};
