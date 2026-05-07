import { getSeoMetadata, rewriteSeoTags } from './seo';

const html = `<!doctype html>
<html>
	<head>
		<title>Old title</title>
		<meta name="description" content="Old description" />
		<meta name="robots" content="index, follow" />
		<meta name="googlebot" content="index, follow" />
		<link rel="canonical" href="https://buzzplay.app/" />
		<meta property="og:url" content="https://buzzplay.app/" />
		<meta property="og:title" content="Old title" />
		<meta property="og:description" content="Old description" />
		<meta name="twitter:title" content="Old title" />
		<meta name="twitter:description" content="Old description" />
	</head>
	<body></body>
</html>`;

describe('SEO metadata', () => {
	it('keeps /feed canonicalized to the homepage duplicate', () => {
		expect(getSeoMetadata('/feed')).toMatchObject({
			canonicalPath: '/',
			robots: 'index, follow',
		});
	});

	it('uses a self canonical for discover', () => {
		const metadata = getSeoMetadata('/discover/');
		const rewritten = rewriteSeoTags(html, metadata, 'https://buzzplay.app');

		expect(rewritten).toContain('<title>Discover Interactive AI Content | BuzzPlay</title>');
		expect(rewritten).toContain('<link rel="canonical" href="https://buzzplay.app/discover" />');
		expect(rewritten).toContain('<meta property="og:url" content="https://buzzplay.app/discover" />');
	});

	it('marks unknown platform routes noindex', () => {
		const metadata = getSeoMetadata('/old-missing-page');
		const rewritten = rewriteSeoTags(html, metadata, 'https://buzzplay.app');

		expect(metadata).toMatchObject({
			canonicalPath: '/old-missing-page',
			robots: 'noindex, nofollow',
		});
		expect(rewritten).toContain('<meta name="robots" content="noindex, nofollow" />');
		expect(rewritten).toContain('<meta name="googlebot" content="noindex, nofollow" />');
	});
});
