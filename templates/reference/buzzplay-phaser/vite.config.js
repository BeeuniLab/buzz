import { exec } from "node:child_process";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import pino from "pino";
import { defineConfig, loadEnv } from "vite";

const logger = pino();

const stripAnsi = (str) =>
	str.replace(
		/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		"",
	);

const LOG_MESSAGE_BOUNDARY = /\n(?=\[[A-Z][^\]]*\])/g;

const emitLog = (level, rawMessage) => {
	const cleaned = stripAnsi(rawMessage).replace(/\r\n/g, "\n");
	const parts = cleaned
		.split(LOG_MESSAGE_BOUNDARY)
		.map((part) => part.trimEnd())
		.filter((part) => part.trim().length > 0);

	if (parts.length === 0) {
		logger[level](cleaned.trimEnd());
		return;
	}

	for (const part of parts) {
		logger[level](part);
	}
};

const customLogger = {
	warnOnce: (msg) => emitLog("warn", msg),
	info: (msg) => emitLog("info", msg),
	warn: (msg) => emitLog("warn", msg),
	error: (msg) => emitLog("error", msg),
	hasErrorLogged: () => false,
	clearScreen: () => {},
	hasWarned: false,
};

function watchDependenciesPlugin() {
	return {
		name: "watch-dependencies",
		configureServer(server) {
			const filesToWatch = [
				path.resolve("package.json"),
				path.resolve("bun.lock"),
			];

			server.watcher.add(filesToWatch);
			server.watcher.on("change", (filePath) => {
				if (!filesToWatch.includes(filePath)) return;

				exec("rm -f .eslintcache tsconfig.tsbuildinfo", (err, _stdout, stderr) => {
					if (err) {
						console.error("Failed to clear caches:", stderr);
					}
				});
			});
		},
	};
}

function reloadTriggerPlugin() {
	return {
		name: "reload-trigger",
		configureServer(server) {
			const triggerFile = path.resolve(".reload-trigger");
			server.watcher.add(triggerFile);
			server.watcher.on("change", (filePath) => {
				if (filePath === triggerFile || filePath.endsWith(".reload-trigger")) {
					logger.info("Reload triggered via .reload-trigger");
					server.ws.send({ type: "full-reload" });
				}
			});
		},
	};
}

export default ({ mode }) => {
	const env = loadEnv(mode, process.cwd());

	return defineConfig({
		plugins: [cloudflare(), react(), watchDependenciesPlugin(), reloadTriggerPlugin()],
		build: {
			minify: true,
			sourcemap: "inline",
			rollupOptions: {
				output: {
					manualChunks: {
						phaser: ["phaser"],
						react: ["react", "react-dom"],
					},
					sourcemapExcludeSources: false,
				},
			},
		},
		customLogger: env.VITE_LOGGER_TYPE === "json" ? customLogger : undefined,
		server: {
			allowedHosts: true,
			watch: {
				awaitWriteFinish: {
					stabilityThreshold: 150,
					pollInterval: 50,
				},
			},
		},
		cacheDir: "node_modules/.vite",
	});
};
