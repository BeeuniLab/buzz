import assetMapRaw from "./asset_map?raw";

export type PlayableAsset = {
	path: string;
	url: string;
	description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssetMap(raw: string): PlayableAsset[] {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			return [];
		}

		return Object.entries(parsed).flatMap(([path, value]) => {
			if (typeof value === "string") {
				return [{ path, url: value }];
			}

			if (!isRecord(value) || typeof value.url !== "string") {
				return [];
			}

			const asset: PlayableAsset = { path, url: value.url };
			if (typeof value.description === "string") {
				asset.description = value.description;
			}
			return [asset];
		});
	} catch {
		return [];
	}
}

export const playableAssets = parseAssetMap(assetMapRaw);

export function getAssetsByType(type: "images" | "audio" | "video" | "fonts" | "models" | string): PlayableAsset[] {
	return playableAssets.filter((asset) => asset.path.startsWith(`${type}/`));
}

export function findAssetByDescription(keywords: string[]): PlayableAsset | undefined {
	const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());

	return playableAssets.find((asset) => {
		const haystack = `${asset.path} ${asset.description ?? ""}`.toLowerCase();
		return normalizedKeywords.some((keyword) => haystack.includes(keyword));
	});
}

export const firstImageAsset = getAssetsByType("images")[0];
export const firstAudioAsset = getAssetsByType("audio")[0];
export const firstVideoAsset = getAssetsByType("video")[0];
