import type { WranglerConfig } from '../deployer/types';
import {
	getWorkerModuleAssetsPath,
	getWorkerModuleRelativePath,
	getWorkerScriptCandidates,
} from './deploymentPaths';

function makeConfig(partial: Partial<WranglerConfig>): WranglerConfig {
	return {
		name: 'sample-app',
		main: 'worker/index.ts',
		compatibility_date: '2025-04-24',
		...partial,
	};
}

describe('deployment path helpers', () => {
	it('tries Cloudflare Vite worker output before legacy dist/index.js for TS worker entries', () => {
		const candidates = getWorkerScriptCandidates('instance-1', makeConfig({ name: 'sample-app' }));

		expect(candidates).toEqual([
			'/workspace/instance-1/dist/sample-app/index.js',
			'/workspace/instance-1/dist/sample_app/index.js',
			'/workspace/instance-1/dist/index.js',
			'/workspace/instance-1/dist/_worker.js/index.js',
		]);
	});

	it('keeps plain JavaScript worker entry as a fallback for unbundled static workers', () => {
		const candidates = getWorkerScriptCandidates('instance-1', makeConfig({
			main: 'worker/host.js',
		}));

		expect(candidates).toEqual([
			'/workspace/instance-1/dist/sample-app/index.js',
			'/workspace/instance-1/dist/sample_app/index.js',
			'/workspace/instance-1/dist/index.js',
			'/workspace/instance-1/dist/_worker.js/index.js',
			'/workspace/instance-1/worker/host.js',
		]);
	});

	it('includes sanitized output names for wrangler names with spaces', () => {
		const candidates = getWorkerScriptCandidates('instance-1', makeConfig({
			name: 'My Sample App',
		}));

		expect(candidates).toContain('/workspace/instance-1/dist/My Sample App/index.js');
		expect(candidates).toContain('/workspace/instance-1/dist/My_Sample_App/index.js');
		expect(candidates).toContain('/workspace/instance-1/dist/my-sample-app/index.js');
	});

	it('maps worker asset modules relative to the worker output directory', () => {
		const assetsPath = getWorkerModuleAssetsPath(
			'instance-1',
			'/workspace/instance-1/dist/sample-app/index.js',
		);

		expect(assetsPath).toBe('instance-1/dist/sample-app/assets');
		expect(getWorkerModuleRelativePath(assetsPath!, 'instance-1/dist/sample-app/assets/chunk.js'))
			.toBe('assets/chunk.js');
	});
});
