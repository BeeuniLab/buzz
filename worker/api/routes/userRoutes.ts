import { UserController } from '../controllers/user/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { UserService } from '../../database/services/UserService';

/**
 * Setup user management routes
 */
export function setupUserRoutes(app: Hono<AppEnv>): void {
    // User apps with pagination (this is what the frontend needs)
    app.get('/api/user/apps', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.getApps));

    // User profile
    app.put('/api/user/profile', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.updateProfile));

    // Public user profile by ID
    app.get('/api/users/:userId/profile', async (c) => {
        const userId = c.req.param('userId');
        const userService = new UserService(c.env);
        const user = await userService.findUser({ id: userId });
        if (!user) {
            return c.json({ success: false, error: { message: 'User not found' } }, 404);
        }
        return c.json({
            success: true,
            data: {
                id: user.id,
                displayName: user.displayName,
                username: user.username,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
            },
        });
    });
}