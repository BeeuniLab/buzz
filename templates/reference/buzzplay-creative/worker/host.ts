/// <reference types="@cloudflare/workers-types" />
/**
 * Static game host: ASSETS + /__buzzplay-host/v1 APIs.
 * KV: HOST_KV. Optional BUZZPLAY_AUTH_SECRET: signed session cookie bp_sess for logged-in sync
 * (credentials: include — no extra UI in the game).
 * Optional BUZZPLAY_COOKIE_DOMAIN: registrable domain e.g. `example.com` so `bp_sess` is sent on all
 * subdomains (app.example.com login → play.example.com sees same session). Anonymous bp_hid stays host-only.
 */
export interface Env {
	ASSETS: Fetcher;
	HOST_KV?: KVNamespace;
	/** Set via `wrangler secret put BUZZPLAY_AUTH_SECRET` (or vars for local dev). Min length 16. */
	BUZZPLAY_AUTH_SECRET?: string;
	/** e.g. `example.com` — Domain attribute for bp_sess only (shared across subdomains). */
	BUZZPLAY_COOKIE_DOMAIN?: string;
}

type StoredLbEntry = {
	username: string;
	profilePicture: string | null;
	score: number;
	_vid: string;
};

type SessionPayload = {
	sub: string;
	name: string;
	picture: string | null;
	exp: number;
};

type Actor =
	| { kind: 'user'; userId: string; displayName: string; profilePicture: string | null }
	| { kind: 'visitor'; visitorId: string };

const API = '/__buzzplay-host/v1';
const SESSION_COOKIE = 'bp_sess';
const SESSION_DAYS = 30;

function json(body: unknown, init: ResponseInit = {}): Response {
	const h = new Headers(init.headers);
	h.set('Content-Type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(body), { ...init, headers: h });
}

function getCookie(request: Request, name: string): string | null {
	const raw = request.headers.get('Cookie');
	if (!raw) return null;
	const re = new RegExp(`(?:^|; )${name}=([^;]*)`);
	const m = re.exec(raw);
	return m ? decodeURIComponent(m[1]) : null;
}

function withVisitorCookie(request: Request, response: Response, visitorId: string): Response {
	const url = new URL(request.url);
	const secure = url.protocol === 'https:';
	const h = new Headers(response.headers);
	const bits = [
		`bp_hid=${encodeURIComponent(visitorId)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		'Max-Age=31536000',
	];
	if (secure) bits.push('Secure');
	h.append('Set-Cookie', bits.join('; '));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

/** Normalized Domain= value for Set-Cookie (no leading dot). */
function sessionCookieDomain(env: Env): string | null {
	const raw = env.BUZZPLAY_COOKIE_DOMAIN?.trim();
	if (!raw) return null;
	return raw.startsWith('.') ? raw.slice(1) : raw;
}

function withSessionCookie(
	request: Request,
	response: Response,
	value: string,
	maxAgeSec: number,
	env: Env,
): Response {
	const url = new URL(request.url);
	const secure = url.protocol === 'https:';
	const h = new Headers(response.headers);
	const bits = [
		`${SESSION_COOKIE}=${encodeURIComponent(value)}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${maxAgeSec}`,
	];
	const dom = sessionCookieDomain(env);
	if (dom) bits.push(`Domain=${dom}`);
	if (secure) bits.push('Secure');
	h.append('Set-Cookie', bits.join('; '));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function clearSessionCookie(request: Request, response: Response, env: Env): Response {
	const url = new URL(request.url);
	const secure = url.protocol === 'https:';
	const h = new Headers(response.headers);
	const bits = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
	const dom = sessionCookieDomain(env);
	if (dom) bits.push(`Domain=${dom}`);
	if (secure) bits.push('Secure');
	h.append('Set-Cookie', bits.join('; '));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function stripVid(e: StoredLbEntry): { username: string; profilePicture: string | null; score: number } {
	return { username: e.username, profilePicture: e.profilePicture, score: e.score };
}

async function readBody<T>(request: Request): Promise<T | null> {
	try {
		return (await request.json()) as T;
	} catch {
		return null;
	}
}

function b64urlFromBytes(buf: ArrayBuffer): string {
	const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8Bytes(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	const raw = utf8Bytes(secret);
	const rawAb = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
	return crypto.subtle.importKey('raw', rawAb, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signPayload(secret: string, payloadB64url: string): Promise<string> {
	const key = await hmacKey(secret);
	const data = utf8Bytes(payloadB64url);
	const dataAb = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	const sigBuf = await crypto.subtle.sign('HMAC', key, dataAb);
	return b64urlFromBytes(sigBuf);
}

async function verifyPayload(secret: string, payloadB64url: string, sigB64url: string): Promise<boolean> {
	const key = await hmacKey(secret);
	let sigBin: Uint8Array;
	try {
		const pad = '='.repeat((4 - (sigB64url.length % 4)) % 4);
		const b64 = sigB64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
		sigBin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	} catch {
		return false;
	}
	const data = utf8Bytes(payloadB64url);
	const sigAb = sigBin.buffer.slice(sigBin.byteOffset, sigBin.byteOffset + sigBin.byteLength) as ArrayBuffer;
	const dataAb = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	return crypto.subtle.verify('HMAC', key, sigAb, dataAb);
}

function jsonToB64url(obj: SessionPayload): string {
	const s = JSON.stringify(obj);
	const b64 = btoa(unescape(encodeURIComponent(s)));
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToJson<T>(payloadB64url: string): T | null {
	try {
		const pad = '='.repeat((4 - (payloadB64url.length % 4)) % 4);
		const b64 = payloadB64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
		const s = decodeURIComponent(escape(atob(b64)));
		return JSON.parse(s) as T;
	} catch {
		return null;
	}
}

async function mintSession(secret: string, p: Omit<SessionPayload, 'exp'>): Promise<string> {
	const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
	const payload: SessionPayload = { ...p, exp };
	const payloadPart = jsonToB64url(payload);
	const sig = await signPayload(secret, payloadPart);
	return `${payloadPart}.${sig}`;
}

async function readSession(request: Request, secret: string | undefined): Promise<SessionPayload | null> {
	if (!secret || secret.length < 16) return null;
	const raw = getCookie(request, SESSION_COOKIE);
	if (!raw) return null;
	const i = raw.lastIndexOf('.');
	if (i <= 0) return null;
	const payloadPart = raw.slice(0, i);
	const sigPart = raw.slice(i + 1);
	const ok = await verifyPayload(secret, payloadPart, sigPart);
	if (!ok) return null;
	const payload = b64urlToJson<SessionPayload>(payloadPart);
	if (!payload?.sub || typeof payload.exp !== 'number') return null;
	if (payload.exp <= Date.now()) return null;
	return payload;
}

async function hashPassword(password: string, salt: Uint8Array): Promise<Uint8Array> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: saltBuf, iterations: 100_000 },
		keyMaterial,
		256,
	);
	return new Uint8Array(bits);
}

function saltB64(salt: Uint8Array): string {
	return b64urlFromBytes(salt.buffer as ArrayBuffer);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let x = 0;
	for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
	return x === 0;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isEmailLike(s: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function resolveActor(
	request: Request,
	secret: string | undefined,
	visitorId: string,
): Promise<{ actor: Actor; session: SessionPayload | null }> {
	const session = await readSession(request, secret);
	if (session) {
		return {
			actor: {
				kind: 'user',
				userId: session.sub,
				displayName: session.name || 'Player',
				profilePicture: session.picture,
			},
			session,
		};
	}
	return { actor: { kind: 'visitor', visitorId }, session: null };
}

function stateKey(actor: Actor, gameId: string): string {
	return actor.kind === 'user' ? `s:u:${actor.userId}:${gameId}` : `s:v:${actor.visitorId}:${gameId}`;
}

function lbVid(actor: Actor): string {
	return actor.kind === 'user' ? `u:${actor.userId}` : `v:${actor.visitorId}`;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith(`${API}/`)) {
			return handleApi(request, env, url);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
	const path = url.pathname;
	const kv = env.HOST_KV;
	const authSecret = env.BUZZPLAY_AUTH_SECRET?.trim() || undefined;

	if (path === `${API}/health`) {
		return json({
			ok: true,
			persistence: kv ? 'kv' : 'none',
			auth: !!(kv && authSecret && authSecret.length >= 16),
			sessionCookieDomain: sessionCookieDomain(env) || null,
		});
	}

	if (!kv) {
		return json({ error: 'HOST_KV not bound' }, { status: 501 });
	}

	let visitorId = getCookie(request, 'bp_hid') ?? '';
	const needNewVisitor = !visitorId;
	if (needNewVisitor) visitorId = crypto.randomUUID();

	const { actor } = await resolveActor(request, authSecret, visitorId);

	async function ensureVisitorIfNeeded(res: Response): Promise<Response> {
		return needNewVisitor ? withVisitorCookie(request, res, visitorId) : res;
	}

	function authSecretOrNull(): string | null {
		return authSecret && authSecret.length >= 16 ? authSecret : null;
	}

	/** ---------- /me (silent session probe for games) ---------- */
	if (path === `${API}/me` && request.method === 'GET') {
		if (actor.kind === 'user') {
			const res = json({
				userId: actor.userId,
				displayName: actor.displayName,
				profilePicture: actor.profilePicture,
				authenticated: true,
			});
			return ensureVisitorIfNeeded(res);
		}
		const res = json({ authenticated: false, userId: null, displayName: null, profilePicture: null });
		return ensureVisitorIfNeeded(res);
	}

	/** ---------- Auth: register / login / logout ---------- */
	if (path === `${API}/auth/register` && request.method === 'POST') {
		const sec = authSecretOrNull();
		if (!sec) return json({ error: 'auth not configured' }, { status: 503 });
		const body = await readBody<{ email?: string; password?: string; displayName?: string }>(request);
		const email = body?.email ? normalizeEmail(body.email) : '';
		const password = body?.password ?? '';
		const displayName = (body?.displayName || email.split('@')[0] || 'Player').slice(0, 64);
		if (!isEmailLike(email) || password.length < 8)
			return json({ error: 'invalid email or password (min 8 chars)' }, { status: 400 });
		const credKey = `cred:${email}`;
		if (await kv.get(credKey)) return json({ error: 'email already registered' }, { status: 409 });
		const userId = crypto.randomUUID();
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const hash = await hashPassword(password, salt);
		await kv.put(
			credKey,
			JSON.stringify({
				userId,
				salt: saltB64(salt),
				hash: saltB64(hash),
			}),
		);
		await kv.put(
			`profile:${userId}`,
			JSON.stringify({ displayName, profilePicture: null as string | null }),
		);
		const token = await mintSession(sec, {
			sub: userId,
			name: displayName,
			picture: null,
		});
		const res = json({ ok: true, userId, displayName });
		return withSessionCookie(request, await ensureVisitorIfNeeded(res), token, SESSION_DAYS * 24 * 60 * 60, env);
	}

	if (path === `${API}/auth/login` && request.method === 'POST') {
		const sec = authSecretOrNull();
		if (!sec) return json({ error: 'auth not configured' }, { status: 503 });
		const body = await readBody<{ email?: string; password?: string }>(request);
		const email = body?.email ? normalizeEmail(body.email) : '';
		const password = body?.password ?? '';
		if (!isEmailLike(email) || !password) return json({ error: 'invalid credentials' }, { status: 400 });
		const raw = await kv.get(`cred:${email}`);
		if (!raw) return json({ error: 'invalid credentials' }, { status: 401 });
		const cred = JSON.parse(raw) as { userId: string; salt: string; hash: string };
		let saltBin: Uint8Array;
		let wantHashBin: Uint8Array;
		try {
			const pad = '='.repeat((4 - (cred.salt.length % 4)) % 4);
			const b64s = cred.salt.replace(/-/g, '+').replace(/_/g, '/') + pad;
			saltBin = Uint8Array.from(atob(b64s), (c) => c.charCodeAt(0));
			const padh = '='.repeat((4 - (cred.hash.length % 4)) % 4);
			const b64h = cred.hash.replace(/-/g, '+').replace(/_/g, '/') + padh;
			wantHashBin = Uint8Array.from(atob(b64h), (c) => c.charCodeAt(0));
		} catch {
			return json({ error: 'invalid credentials' }, { status: 401 });
		}
		const got = await hashPassword(password, saltBin);
		if (!bytesEqual(got, wantHashBin)) return json({ error: 'invalid credentials' }, { status: 401 });
		const profRaw = await kv.get(`profile:${cred.userId}`);
		let displayName = 'Player';
		let picture: string | null = null;
		if (profRaw) {
			const prof = JSON.parse(profRaw) as { displayName?: string; profilePicture?: string | null };
			if (prof.displayName) displayName = prof.displayName;
			picture = prof.profilePicture ?? null;
		}
		const token = await mintSession(sec, { sub: cred.userId, name: displayName, picture });
		const res = json({ ok: true, userId: cred.userId, displayName });
		return withSessionCookie(request, await ensureVisitorIfNeeded(res), token, SESSION_DAYS * 24 * 60 * 60, env);
	}

	if (path === `${API}/auth/logout` && request.method === 'POST') {
		const res = json({ ok: true });
		return clearSessionCookie(request, await ensureVisitorIfNeeded(res), env);
	}

	/** ---------- Save / load / leaderboard ---------- */
	if (path === `${API}/state` && request.method === 'GET') {
		const gameId = url.searchParams.get('gameId') || '';
		if (!gameId) return json({ error: 'gameId required' }, { status: 400 });
		const key = stateKey(actor, gameId);
		const raw = await kv.get(key);
		const uid = actor.kind === 'user' ? actor.userId : visitorId!;
		const res = json({
			userId: uid,
			gameId,
			state: raw ? JSON.parse(raw) : null,
			success: true,
		});
		return ensureVisitorIfNeeded(res);
	}

	if (path === `${API}/state` && request.method === 'PUT') {
		const body = await readBody<{ gameId?: string; state?: unknown }>(request);
		if (!body?.gameId) return json({ error: 'gameId required' }, { status: 400 });
		const key = stateKey(actor, body.gameId);
		await kv.put(key, JSON.stringify(body.state ?? {}));
		const uid = actor.kind === 'user' ? actor.userId : visitorId!;
		const res = json({
			userId: uid,
			gameId: body.gameId,
			state: body.state ?? {},
			success: true,
		});
		return ensureVisitorIfNeeded(res);
	}

	if (path === `${API}/state` && request.method === 'DELETE') {
		const gameId = url.searchParams.get('gameId') || '';
		if (!gameId) return json({ error: 'gameId required' }, { status: 400 });
		await kv.delete(stateKey(actor, gameId));
		return ensureVisitorIfNeeded(json({ success: true }));
	}

	if (path === `${API}/leaderboard` && request.method === 'GET') {
		const gameId = url.searchParams.get('gameId') || '';
		const n = Math.min(100, Math.max(1, parseInt(url.searchParams.get('n') || '10', 10) || 10));
		if (!gameId) return json({ error: 'gameId required' }, { status: 400 });
		const raw = await kv.get(`lb:${gameId}`);
		let entries: StoredLbEntry[] = raw ? JSON.parse(raw) : [];
		entries.sort((a, b) => b.score - a.score);
		const vid = lbVid(actor);
		const me = entries.find((e) => e._vid === vid);
		const userRank = me ? entries.findIndex((e) => e._vid === vid) + 1 : null;
		const res = json({
			entries: entries.slice(0, n).map(stripVid),
			userRank,
			success: true,
		});
		return ensureVisitorIfNeeded(res);
	}

	if (path === `${API}/leaderboard/score` && request.method === 'POST') {
		const body = await readBody<{ gameId?: string; score?: number; numEntries?: number }>(request);
		if (!body?.gameId || typeof body.score !== 'number') {
			return json({ error: 'gameId and score required' }, { status: 400 });
		}
		const gameId = body.gameId;
		const n = Math.min(100, Math.max(1, body.numEntries ?? 10));
		const raw = await kv.get(`lb:${gameId}`);
		let entries: StoredLbEntry[] = raw ? JSON.parse(raw) : [];
		const vid = lbVid(actor);
		entries = entries.filter((e) => e._vid !== vid);
		const uname =
			actor.kind === 'user' ? actor.displayName : `Guest-${String(visitorId).replace(/-/g, '').slice(0, 6)}`;
		const pic = actor.kind === 'user' ? actor.profilePicture : null;
		entries.push({
			username: uname,
			profilePicture: pic,
			score: body.score,
			_vid: vid,
		});
		entries.sort((a, b) => b.score - a.score);
		entries = entries.slice(0, 500);
		await kv.put(`lb:${gameId}`, JSON.stringify(entries));
		const userRank = entries.findIndex((e) => e._vid === vid) + 1;
		const res = json({
			entries: entries.slice(0, n).map(stripVid),
			userRank: userRank || null,
			success: true,
		});
		return ensureVisitorIfNeeded(res);
	}

	return json({ error: 'Not found' }, { status: 404 });
}
