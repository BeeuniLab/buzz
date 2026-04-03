import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { setAuthLevel, AuthConfig } from '../../middleware/auth/routeAuth';

function getMimeByExtension(file: string): string | undefined {
	const ext = file.substring(file.lastIndexOf('.') + 1).toLowerCase();
	switch (ext) {
		case 'png': return 'image/png';
		case 'jpg':
		case 'jpeg': return 'image/jpeg';
		case 'webp': return 'image/webp';
		default: return undefined;
	}
}

export function setupScreenshotRoutes(app: Hono<AppEnv>): void {
	const screenshotsRouter = new Hono<AppEnv>();

	screenshotsRouter.get('/:id/:file', setAuthLevel(AuthConfig.public), async (c) => {
		const appId = c.req.param('id');
		const file = c.req.param('file');

		if (!appId || !file) {
			return c.json({ error: 'Missing parameters' }, 400);
		}

		if (file.includes('..') || file.includes('/') || file.includes('\\')) {
			return c.json({ error: 'Invalid file name' }, 400);
		}

		const key = `screenshots/${appId}/${file}`;
		const obj = await c.env.TEMPLATES_BUCKET.get(key);
		if (!obj || !obj.body) {
			return c.json({ error: 'Not found' }, 404);
		}

		const contentType = obj.httpMetadata?.contentType || getMimeByExtension(file) || 'image/png';
		return new Response(obj.body, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	});

	app.route('/api/screenshots', screenshotsRouter);
}
