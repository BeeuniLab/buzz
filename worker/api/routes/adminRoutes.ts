import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { getAgentStub } from '../../agents';
import { generateId } from '../../utils/idGenerator';

export function setupAdminRoutes(app: Hono<AppEnv>): void {
    app.post('/api/admin/import-project', async (c) => {
        const adminKey = c.req.header('X-Admin-Key');
        const expectedKey = c.env.ADMIN_IMPORT_KEY || 'dev-import-key';
        if (adminKey !== expectedKey) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{
            userId: string;
            title: string;
            description: string;
            files: Record<string, string>;
            templateName?: string;
            agentId?: string;
            coverBase64?: string;
        }>();

        if (!body.userId || !body.title || !body.files) {
            return c.json({ error: 'Missing required fields: userId, title, files' }, 400);
        }

        const agentId = body.agentId || generateId();
        const stub = await getAgentStub(c.env, agentId, {
            behaviorType: 'phasic',
            projectType: 'app',
        });

        const result = await stub.importProject({
            userId: body.userId,
            agentId,
            title: body.title,
            description: body.description || body.title,
            files: body.files,
            templateName: body.templateName || 'buzzplay-creative',
            coverBase64: body.coverBase64,
        });

        if (result.success) {
            return c.json({ success: true, agentId });
        }
        return c.json({ success: false, error: result.error }, 500);
    });

    app.post('/api/admin/import-files/:agentId', async (c) => {
        const adminKey = c.req.header('X-Admin-Key');
        const expectedKey = c.env.ADMIN_IMPORT_KEY || 'dev-import-key';
        if (adminKey !== expectedKey) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const agentId = c.req.param('agentId');
        const body = await c.req.json<{ files: Record<string, string> }>();

        if (!body.files || Object.keys(body.files).length === 0) {
            return c.json({ error: 'Missing files' }, 400);
        }

        let count = 0;
        for (const [filePath, b64Content] of Object.entries(body.files)) {
            const r2Key = `assets/${agentId}/${filePath}`;
            const bytes = Uint8Array.from(atob(b64Content), ch => ch.charCodeAt(0));
            const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
            const mimeMap: Record<string, string> = {
                '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                '.mp4': 'video/mp4', '.webm': 'video/webm',
                '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
            };
            const contentType = mimeMap[ext] || 'application/octet-stream';
            await c.env.TEMPLATES_BUCKET.put(r2Key, bytes, {
                httpMetadata: { contentType },
            });
            count++;
        }

        return c.json({ success: true, count });
    });
}
