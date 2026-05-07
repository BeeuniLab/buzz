import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { getAgentStub } from '../../agents';
import { generateId } from '../../utils/idGenerator';
import { UserService } from '../../database/services/UserService';
import { syncAgentAssetMap } from '../../utils/agentAssets';

type ImportVisibility = 'private' | 'public';

function getCoverExtension(contentType?: string): 'webp' | 'png' | 'jpg' {
    switch (contentType?.toLowerCase()) {
        case 'image/png':
            return 'png';
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/webp':
        default:
            return 'webp';
    }
}

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
            userId?: string;
            userEmail?: string;
            title: string;
            description: string;
            files: Record<string, string>;
            templateName?: string;
            agentId?: string;
            projectName?: string;
            coverBase64?: string;
            coverContentType?: string;
            visibility?: ImportVisibility;
            framework?: string;
        }>();

        if (!body.title || !body.files) {
            return c.json({ error: 'Missing required fields: title, files' }, 400);
        }

        let userId = body.userId?.trim();
        if (!userId && body.userEmail?.trim()) {
            const userService = new UserService(c.env);
            const email = body.userEmail.trim();
            const lowerEmail = email.toLowerCase();
            const user = await userService.findUser({ email: lowerEmail })
                || (email === lowerEmail ? null : await userService.findUser({ email }));
            if (!user) {
                return c.json({ error: `User not found for email: ${body.userEmail}` }, 404);
            }
            userId = user.id;
        }

        if (!userId) {
            return c.json({ error: 'Missing required field: userId or userEmail' }, 400);
        }

        if (body.visibility && !['private', 'public'].includes(body.visibility)) {
            return c.json({ error: 'visibility must be private or public' }, 400);
        }

        const agentId = body.agentId || generateId();
        const stub = await getAgentStub(c.env, agentId, {
            projectType: 'app',
        });

        const result = await stub.importProject({
            userId,
            agentId,
            projectName: body.projectName,
            title: body.title,
            description: body.description || body.title,
            files: body.files,
            templateName: body.templateName || 'buzzplay-creative',
            coverBase64: body.coverBase64,
            coverContentType: body.coverContentType,
            coverExtension: getCoverExtension(body.coverContentType),
            visibility: body.visibility || 'public',
            framework: body.framework,
        });

        if (result.success) {
            return c.json({ success: true, agentId, userId });
        }
        return c.json({ success: false, error: result.error }, 500);
    });

    app.post('/api/admin/import-files/:agentId', async (c) => {
        if (!checkAdminKey(c)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const agentId = c.req.param('agentId');
        const body = await c.req.json<{ files: Record<string, string>; syncAssetMap?: boolean }>();

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
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.weba': 'audio/webm',
                '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
                '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
                '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'model/obj',
                '.wasm': 'application/wasm', '.js': 'application/javascript', '.mjs': 'application/javascript',
                '.json': 'application/json', '.css': 'text/css', '.html': 'text/html',
                '.txt': 'text/plain', '.md': 'text/markdown',
            };
            const contentType = mimeMap[ext] || 'application/octet-stream';
            await c.env.TEMPLATES_BUCKET.put(r2Key, bytes, {
                httpMetadata: { contentType },
            });
            count++;
        }

        if (body.syncAssetMap) {
            await syncAgentAssetMap(c.env, agentId);
        }

        return c.json({ success: true, count });
    });
}
