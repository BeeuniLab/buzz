type SeoMetadata = {
	title: string;
	description: string;
	canonicalPath: string;
	robots: string;
	googlebot: string;
};

const DEFAULT_TITLE = 'BuzzPlay | Create and Play Interactive AI Content';
const DEFAULT_DESCRIPTION = 'BuzzPlay lets you turn ideas, memes, and characters into playable interactive AI content. Create, play, remix, and share playable posts.';
const DEFAULT_ROBOTS = 'index, follow';
const DEFAULT_GOOGLEBOT = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
const NOINDEX_ROBOTS = 'noindex, nofollow';

function normalizePathname(pathname: string): string {
	const withoutTrailingSlash = pathname.replace(/\/+$/, '');
	return withoutTrailingSlash === '' ? '/' : withoutTrailingSlash;
}

export function getSeoMetadata(pathname: string): SeoMetadata {
	const normalizedPathname = normalizePathname(pathname);

	if (normalizedPathname === '/' || normalizedPathname === '/feed') {
		return {
			title: DEFAULT_TITLE,
			description: DEFAULT_DESCRIPTION,
			canonicalPath: '/',
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	if (normalizedPathname.startsWith('/feed/')) {
		return {
			title: 'BuzzPlay Interactive Post | Play and Remix AI Content',
			description: 'Play, react to, and remix this interactive AI content on BuzzPlay.',
			canonicalPath: normalizedPathname,
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	if (normalizedPathname === '/discover') {
		return {
			title: 'Discover Interactive AI Content | BuzzPlay',
			description: 'Discover playable interactive AI content made by BuzzPlay creators. Explore public posts, remix ideas, and find something new to play.',
			canonicalPath: '/discover',
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	if (normalizedPathname === '/build') {
		return {
			title: 'Create Interactive AI Content | BuzzPlay',
			description: 'Create interactive AI content from prompts, images, memes, and characters, then share playable posts.',
			canonicalPath: '/build',
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	if (normalizedPathname === '/legal') {
		return {
			title: 'BuzzPlay Legal | Terms and Privacy',
			description: 'Review BuzzPlay terms, privacy details, account policies, and service information for interactive AI content creators and players.',
			canonicalPath: '/legal',
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	if (normalizedPathname.startsWith('/profile/')) {
		return {
			title: 'BuzzPlay Creator Profile',
			description: 'View this BuzzPlay creator profile and explore their public interactive AI content.',
			canonicalPath: normalizedPathname,
			robots: DEFAULT_ROBOTS,
			googlebot: DEFAULT_GOOGLEBOT,
		};
	}

	return {
		title: DEFAULT_TITLE,
		description: DEFAULT_DESCRIPTION,
		canonicalPath: normalizedPathname,
		robots: NOINDEX_ROBOTS,
		googlebot: NOINDEX_ROBOTS,
	};
}

function escapeHtmlText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtmlText(value).replace(/"/g, '&quot;');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertHeadTag(html: string, pattern: RegExp, tag: string): string {
	if (pattern.test(html)) {
		return html.replace(pattern, tag);
	}
	return html.replace(/<\/head>/i, `\t\t${tag}\n\t</head>`);
}

function upsertMetaName(html: string, name: string, content: string): string {
	const escapedName = escapeHtmlAttribute(name);
	const escapedContent = escapeHtmlAttribute(content);
	const pattern = new RegExp(`<meta\\s+name=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
	return upsertHeadTag(html, pattern, `<meta name="${escapedName}" content="${escapedContent}" />`);
}

function upsertMetaProperty(html: string, property: string, content: string): string {
	const escapedProperty = escapeHtmlAttribute(property);
	const escapedContent = escapeHtmlAttribute(content);
	const pattern = new RegExp(`<meta\\s+property=["']${escapeRegExp(property)}["'][^>]*>`, 'i');
	return upsertHeadTag(html, pattern, `<meta property="${escapedProperty}" content="${escapedContent}" />`);
}

function upsertCanonical(html: string, canonicalUrl: string): string {
	const pattern = /<link\s+rel=["']canonical["'][^>]*>/i;
	return upsertHeadTag(html, pattern, `<link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`);
}

function getCanonicalOrigin(requestUrl: URL, customDomain: string): string {
	const trimmedDomain = customDomain.trim();
	if (trimmedDomain && trimmedDomain !== 'localhost') {
		return `https://${trimmedDomain}`;
	}
	return requestUrl.origin;
}

export function rewriteSeoTags(html: string, metadata: SeoMetadata, origin: string): string {
	const canonicalUrl = new URL(metadata.canonicalPath, `${origin}/`).href;
	const escapedTitle = escapeHtmlText(metadata.title);
	let nextHtml = upsertHeadTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);

	nextHtml = upsertMetaName(nextHtml, 'description', metadata.description);
	nextHtml = upsertMetaName(nextHtml, 'robots', metadata.robots);
	nextHtml = upsertMetaName(nextHtml, 'googlebot', metadata.googlebot);
	nextHtml = upsertCanonical(nextHtml, canonicalUrl);
	nextHtml = upsertMetaProperty(nextHtml, 'og:url', canonicalUrl);
	nextHtml = upsertMetaProperty(nextHtml, 'og:title', metadata.title);
	nextHtml = upsertMetaProperty(nextHtml, 'og:description', metadata.description);
	nextHtml = upsertMetaName(nextHtml, 'twitter:title', metadata.title);
	nextHtml = upsertMetaName(nextHtml, 'twitter:description', metadata.description);

	return nextHtml;
}

export async function rewriteAssetResponseForSeo(
	request: Request,
	response: Response,
	customDomain: string,
): Promise<Response> {
	if (request.method !== 'GET') {
		return response;
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.toLowerCase().includes('text/html')) {
		return response;
	}

	const requestUrl = new URL(request.url);
	const metadata = getSeoMetadata(requestUrl.pathname);
	const origin = getCanonicalOrigin(requestUrl, customDomain);
	const html = await response.text();
	const rewrittenHtml = rewriteSeoTags(html, metadata, origin);
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	if (!headers.has('content-type')) {
		headers.set('content-type', 'text/html; charset=utf-8');
	}

	return new Response(rewrittenHtml, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
