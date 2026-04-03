import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { getAgentStub } from '../../agents';
import { generateId } from '../../utils/idGenerator';
import { UserService } from '../../database/services/UserService';

export function setupAdminRoutes(app: Hono<AppEnv>): void {
    // Shared admin key check
    const checkAdminKey = (c: { req: { header: (name: string) => string | undefined }; env: { ADMIN_IMPORT_KEY?: string } }) => {
        const adminKey = c.req.header('X-Admin-Key');
        const expectedKey = c.env.ADMIN_IMPORT_KEY || 'dev-import-key';
        return adminKey === expectedKey;
    };

    // Bulk import users
    app.post('/api/admin/import-users', async (c) => {
        if (!checkAdminKey(c)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{
            users: Array<{
                username: string;
                displayName: string;
                email: string;
                bio?: string;
                avatarUrl?: string;
            }>;
        }>();

        if (!body.users || !Array.isArray(body.users)) {
            return c.json({ error: 'Missing required field: users (array)' }, 400);
        }

        const userService = new UserService(c.env);
        let inserted = 0;
        let skipped = 0;
        const results: Array<{ username: string; id?: string; error?: string }> = [];

        for (const u of body.users) {
            try {
                const user = await userService.createUser({
                    id: generateId(),
                    email: u.email,
                    username: u.username,
                    displayName: u.displayName,
                    avatarUrl: u.avatarUrl || null,
                    bio: u.bio || null,
                    provider: 'seed',
                    providerId: `seed_${u.username}`,
                    emailVerified: true,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                results.push({ username: u.username, id: user.id });
                inserted++;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                results.push({ username: u.username, error: msg });
                skipped++;
            }
        }

        return c.json({ success: true, inserted, skipped, results });
    });

    app.post('/api/admin/import-project', async (c) => {
        if (!checkAdminKey(c)) {
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
        if (!checkAdminKey(c)) {
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
