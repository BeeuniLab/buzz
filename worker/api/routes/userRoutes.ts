import { UserController } from '../controllers/user/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup user management routes
 */
export function setupUserRoutes(app: Hono<AppEnv>): void {
    // User apps with pagination (this is what the frontend needs)
    app.get('/api/user/apps', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.getApps));

    // Inbox
    app.get('/api/user/inbox/followers', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.getFollowerInbox));

    // User profile
    app.put('/api/user/profile', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.updateProfile));

    // Follow / unfollow users
    app.post('/api/users/:userId/follow', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.followUser));
    app.delete('/api/users/:userId/follow', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.unfollowUser));

    // Public user profile by ID, with optional auth for follow state
    app.get('/api/users/:userId/profile', setAuthLevel(AuthConfig.public), adaptController(UserController, UserController.getPublicProfile));
}
