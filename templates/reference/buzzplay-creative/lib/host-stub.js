/**
 * Full browser host for HTML creative apps: loads config + asset_map, implements lib (assets, sprite
 * animations, save/load, leaderboard) against /__buzzplay-host/v1 when Worker+KV is deployed;
 * otherwise sessionStorage + empty leaderboard. Loaded from src/code.html.
 *
 * Optional: window.__BUZZPLAY_HOST_API__ = '/prefix/__buzzplay-host/v1' if API is mounted elsewhere.
 */
(function () {
	if (window.lib) return;

	var KEY = '_buzzplayGameState';
	var API = window.__BUZZPLAY_HOST_API__ || '/__buzzplay-host/v1';
	var persistence = 'none'; // 'kv' | 'none'
	var hostAuth = false; // BUZZPLAY_AUTH_SECRET configured server-side
	window.__assetMap = {};
	window.__buzzplayUser = null;
	window.__buzzplayGameId = '';
	var __imageCache = Object.create(null);

	window.__buzzplayImageCache = __imageCache;

	async function loadLocalAssetMap() {
		try {
			var r = await fetch(new URL('asset_map', window.location.href).href);
			if (!r.ok) return null;
			var j = await r.json();
			return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
		} catch (e) {
			return null;
		}
	}

	async function probePersistence() {
		try {
			var r = await fetch(API + '/health', { credentials: 'include' });
			if (!r.ok) {
				persistence = 'none';
				return;
			}
			var j = await r.json();
			persistence = j && j.persistence === 'kv' ? 'kv' : 'none';
			hostAuth = !!(j && j.auth);
		} catch (e) {
			persistence = 'none';
		}
	}

	/** Same-origin session cookie: no extra UI in the game if user already logged in on this domain. */
	async function syncSessionProbe() {
		if (persistence !== 'kv') return;
		try {
			var r = await fetch(API + '/me', { credentials: 'include' });
			if (!r.ok) return;
			var j = await r.json();
			if (j && j.authenticated && j.userId) {
				window.__buzzplayUser = {
					userId: j.userId,
					displayName: j.displayName || '',
					profilePicture: j.profilePicture || null,
				};
			}
		} catch (e) {}
	}

	function loadRawState() {
		try {
			var t = sessionStorage.getItem(KEY);
			if (!t) return null;
			return JSON.parse(t);
		} catch (e) {
			return null;
		}
	}

	function localSave(state) {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(state || {}));
		} catch (e) {}
	}

	function localClear() {
		try {
			sessionStorage.removeItem(KEY);
		} catch (e) {}
	}

	async function fetchJson(path, opts) {
		var r = await fetch(API + path, Object.assign({ credentials: 'include' }, opts || {}));
		if (r.status === 501) throw new Error('remote persistence unavailable');
		if (!r.ok) throw new Error('HTTP ' + r.status);
		return r.json();
	}

	function resolveAsset(id) {
		var m = window.__assetMap && window.__assetMap[id];
		if (!m) return undefined;
		if (typeof m.url === 'string') return m;
		if (m.animation && typeof m.animation.url === 'string')
			return Object.assign({}, m, { url: m.animation.url });
		return m;
	}

	function ensureImage(assetId) {
		var asset = resolveAsset(assetId);
		if (!asset || !asset.url) return Promise.resolve(null);
		if (__imageCache[assetId] && __imageCache[assetId].complete) return Promise.resolve(__imageCache[assetId]);
		return new Promise(function (resolve) {
			var img = __imageCache[assetId] || new Image();
			img.crossOrigin = 'anonymous';
			img.onload = function () {
				resolve(img);
			};
			img.onerror = function () {
				console.warn('[game-host] failed to load sheet', assetId);
				resolve(null);
			};
			img.src = asset.url;
			__imageCache[assetId] = img;
		});
	}

	function makeSpritePlayer(img, asset, anim) {
		var frames = anim.frames || [];
		var fps = anim.fps || 8;
		var loop = anim.loop !== false;
		return {
			_img: img,
			_frames: frames,
			_fps: fps,
			_loop: loop,
			_index: 0,
			_lastTime: null,
			reset: function () {
				this._index = 0;
				this._lastTime = null;
			},
			update: function (timestamp) {
				if (!this._frames.length) return;
				if (this._lastTime == null) this._lastTime = timestamp;
				var spf = 1000 / this._fps;
				var delta = timestamp - this._lastTime;
				var steps = Math.floor(delta / spf);
				if (steps > 0) {
					this._lastTime += steps * spf;
					this._index += steps;
					if (this._loop) this._index %= this._frames.length;
					else this._index = Math.min(this._index, this._frames.length - 1);
				}
			},
			draw: function (ctx, dx, dy, dw, dh) {
				var img = this._img;
				if (!img || !img.complete || !img.naturalWidth) return;
				var f = this._frames[this._index];
				if (!f) return;
				var sx = f.x;
				var sy = f.y;
				var sw = f.width;
				var sh = f.height;
				ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
			},
			getCurrentFrame: function () {
				var f = this._frames[this._index];
				return {
					index: this._index,
					frame: f
						? { x: f.x, y: f.y, w: f.width, h: f.height }
						: undefined,
					total: this._frames.length,
				};
			},
		};
	}

	function makeStaticPlayer(img) {
		return {
			_img: img,
			_lastTime: null,
			reset: function () {
				this._lastTime = null;
			},
			update: function (_timestamp) {},
			draw: function (ctx, dx, dy, dw, dh) {
				var img = this._img;
				if (!img || !img.complete || !img.naturalWidth) return;
				ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, dw, dh);
			},
			getCurrentFrame: function () {
				return { index: 0, frame: undefined, total: 1 };
			},
		};
	}

	async function hydrateAssetMap() {
		var localMap = await loadLocalAssetMap();
		if (localMap) Object.assign(window.__assetMap, localMap);

		var configUrl = new URL('config', window.location.href).href;
		try {
			var r = await fetch(configUrl);
			if (r.ok) {
				var cfg = await r.json();
				if (cfg && typeof cfg === 'object') {
					var htmlCfg =
						typeof window.gameConfig === 'object' && window.gameConfig !== null ? window.gameConfig : {};
					window.gameConfig = Object.assign({}, htmlCfg, cfg);
				}
			}
		} catch (e) {
			console.warn('[host] config not loaded:', e);
		}
	}

	window.lib = {
		log: function () {
			var a = ['[game-host]'].concat(Array.prototype.slice.call(arguments));
			console.log.apply(console, a);
		},

		getAsset: function (id) {
			var m = window.__assetMap && window.__assetMap[id];
			if (!m) return undefined;
			return m;
		},

		getAnimationPlayer: function (assetId) {
			var raw = window.__assetMap && window.__assetMap[assetId];
			if (!raw || !raw.url) return null;
			var img = __imageCache[assetId];
			var anim = raw.animation;
			if (anim && Array.isArray(anim.frames) && anim.frames.length) {
				if (!img || !img.complete) return null;
				return makeSpritePlayer(img, raw, anim);
			}
			if (!img || !img.complete) return null;
			return makeStaticPlayer(img);
		},

		preloadAnimation: async function (assetId) {
			await ensureImage(assetId);
		},

		addPlayerScoreToLeaderboard: async function (score, numEntries) {
			var gid = window.__buzzplayGameId || 'game';
			if (persistence === 'kv') {
				try {
					return await fetchJson('/leaderboard/score', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							gameId: gid,
							score: score,
							numEntries: numEntries,
						}),
					});
				} catch (e) {
					return { entries: [], userRank: null, success: true };
				}
			}
			return { entries: [], userRank: null, success: true };
		},

		getTopNEntriesFromLeaderboard: async function (numEntries) {
			var gid = window.__buzzplayGameId || 'game';
			var n = numEntries == null ? 10 : numEntries;
			if (persistence === 'kv') {
				try {
					return await fetchJson('/leaderboard?gameId=' + encodeURIComponent(gid) + '&n=' + n);
				} catch (e) {
					return { entries: [], userRank: null, success: true };
				}
			}
			return { entries: [], userRank: null, success: true };
		},

		saveUserGameState: async function (state) {
			var gid = window.__buzzplayGameId || 'game';
			if (persistence === 'kv') {
				try {
					return await fetchJson('/state', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ gameId: gid, state: state || {} }),
					});
				} catch (e) {
					localSave(state);
					return {
						userId: '',
						gameId: gid,
						state: state || {},
						success: true,
					};
				}
			}
			localSave(state);
			return {
				userId: '',
				gameId: gid,
				state: state || {},
				success: true,
			};
		},

		getUserGameState: async function () {
			var gid = window.__buzzplayGameId || 'game';
			if (persistence === 'kv') {
				try {
					return await fetchJson('/state?gameId=' + encodeURIComponent(gid));
				} catch (e) {
					var s = loadRawState();
					return {
						userId: '',
						gameId: gid,
						state: s,
						success: true,
					};
				}
			}
			return {
				userId: '',
				gameId: gid,
				state: loadRawState(),
				success: true,
			};
		},

		deleteUserGameState: async function () {
			var gid = window.__buzzplayGameId || 'game';
			if (persistence === 'kv') {
				try {
					return await fetchJson('/state?gameId=' + encodeURIComponent(gid), {
						method: 'DELETE',
					});
				} catch (e) {
					localClear();
					return { success: true };
				}
			}
			localClear();
			return { success: true };
		},

		showGameParameters: function () {},
		editMenu: {
			open: function (opts) {
				console.warn('[game-host] editMenu.open', opts);
			},
			close: function () {},
		},
	};

	async function boot() {
		await probePersistence();
		await syncSessionProbe();
		try {
			await hydrateAssetMap();
		} catch (e) {
			console.warn('[host] hydrate failed:', e);
		}
		window.lib.log(
			'context hydrate:',
			Object.keys(window.__assetMap).length,
			'assets; persistence:',
			persistence + (hostAuth ? '; auth: on' : '') + (window.__buzzplayUser ? '; signed in' : ''),
		);
		if (typeof window.run === 'function') window.run('play');
	}

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', function () {
			boot();
		});
	else boot();
})();
