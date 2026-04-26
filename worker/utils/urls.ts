export const getProtocolForHost = (host: string): string => {
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0') || host.startsWith('::1')) {
        return 'http';
    } else {
        return 'https';
    }
}

const DEFAULT_PUBLISHED_WORKER_DOMAIN = 'buzzplay.app';

function getOptionalEnvVar(env: Env, key: string): string | undefined {
    const value = (env as unknown as Record<string, string | undefined>)[key];
    return value?.trim() || undefined;
}

function isLocalDomain(domain: string | undefined): boolean {
    if (!domain) return false;
    return domain.startsWith('localhost')
        || domain.startsWith('127.0.0.1')
        || domain.startsWith('0.0.0.0')
        || domain.startsWith('::1');
}

export function getPreviewDomain(env: Env): string {
    if (env.CUSTOM_PREVIEW_DOMAIN && env.CUSTOM_PREVIEW_DOMAIN.trim() !== '') {
        return env.CUSTOM_PREVIEW_DOMAIN;
    }
    return env.CUSTOM_DOMAIN;
}

export function getPublishedWorkerDomain(env: Env): string {
    const explicitDomain = getOptionalEnvVar(env, 'CUSTOM_DEPLOYMENT_DOMAIN')
        ?? getOptionalEnvVar(env, 'CUSTOM_PUBLISHED_DOMAIN');
    if (explicitDomain) {
        return explicitDomain;
    }

    if (isLocalDomain(env.CUSTOM_DOMAIN)) {
        return DEFAULT_PUBLISHED_WORKER_DOMAIN;
    }

    return env.CUSTOM_DOMAIN;
}

export function normalizeDeploymentId(deploymentId: string): string {
    const normalized = deploymentId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'playable';
}

export function buildUserWorkerUrl(env: Env, deploymentId: string): string {
    const domain = getPublishedWorkerDomain(env);
    const protocol = getProtocolForHost(domain);
    return `${protocol}://${normalizeDeploymentId(deploymentId)}.${domain}`;
}

/**
 * Migrate a stored preview URL to the current domain.
 * Extracts subdomain from old URL and rebuilds with current getPreviewDomain().
 * Used to handle domain changes without invalidating existing preview instances.
 */
export function migratePreviewUrl(storedUrl: string | undefined, env: Env): string | undefined {
    if (!storedUrl) return undefined;

    try {
        const url = new URL(storedUrl);
        const hostname = url.hostname;
        const currentDomain = getPreviewDomain(env);

        // Already using current domain
        if (hostname.endsWith(`.${currentDomain}`)) {
            return storedUrl;
        }

        // Extract subdomain by finding the first dot
        const firstDotIndex = hostname.indexOf('.');
        if (firstDotIndex === -1) return storedUrl;

        const subdomain = hostname.slice(0, firstDotIndex);

        // Rebuild with current domain
        return `${url.protocol}//${subdomain}.${currentDomain}${url.pathname}`;
    } catch {
        return storedUrl;
    }
}

export function isUsableTunnelUrl(url: string | undefined): boolean {
    if (!url) return false;

    try {
        const parsed = new URL(url);

        // Cloudflare control-plane endpoint, not an application preview URL.
        if (parsed.hostname === 'api.trycloudflare.com') {
            return false;
        }

        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

export function shouldUseTunnelForPreview(env: Pick<Env, 'USE_TUNNEL_FOR_PREVIEW'>): boolean {
    return env.USE_TUNNEL_FOR_PREVIEW?.trim().toLowerCase() === 'true';
}

export function resolvePreviewUrl(
    previewURL: string | undefined,
    tunnelURL: string | undefined,
    env: Env
): string | undefined {
    const migratedPreviewUrl = migratePreviewUrl(previewURL, env);
    const usableTunnelUrl = isUsableTunnelUrl(tunnelURL) ? tunnelURL : undefined;

    if (shouldUseTunnelForPreview(env)) {
        return usableTunnelUrl || migratedPreviewUrl;
    }

    return migratedPreviewUrl || usableTunnelUrl;
}

/**
 * Normalize stored internal API URLs to same-origin relative paths.
 * This avoids CSP issues caused by legacy absolute localhost URLs.
 */
export function normalizeStoredInternalApiUrl(storedUrl: string | null | undefined): string | null | undefined {
    if (!storedUrl) return storedUrl;
    if (storedUrl.startsWith('/api/')) {
        return storedUrl;
    }

    try {
        const parsed = new URL(storedUrl);
        if (parsed.pathname.startsWith('/api/')) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        // Leave non-URL strings untouched.
    }

    return storedUrl;
}
