import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { AssetController } from '../controllers/assets/controller';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupAssetRoutes(app: Hono<AppEnv>): void {
	const assetRouter = new Hono<AppEnv>();

	assetRouter.get(
		'/:agentId/assets',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(AssetController, AssetController.listAssets),
	);

	// Serve asset file binary (same-origin, avoids CSP issues with preview subdomain)
	assetRouter.get(
		'/:agentId/assets/file/*',
		setAuthLevel(AuthConfig.public),
		adaptController(AssetController, AssetController.serveAsset),
	);

	assetRouter.post(
		'/:agentId/assets',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(AssetController, AssetController.uploadAsset),
	);

	assetRouter.delete(
		'/:agentId/assets/*',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(AssetController, AssetController.deleteAsset),
	);

	app.route('/api/projects', assetRouter);
}
