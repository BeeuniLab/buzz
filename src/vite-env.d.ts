/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
	readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
	readonly VITE_KLIPY_API_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
