import assetMapRaw from '@/asset_map?raw'

export interface PlayableAsset {
  path: string
  url: string
  description?: string
}

type RawAssetEntry = string | { url?: unknown; description?: unknown }

function parseAssetMap(raw: string): PlayableAsset[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, RawAssetEntry>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return []
    }

    return Object.entries(parsed).flatMap(([path, value]) => {
      if (typeof value === 'string') {
        return [{ path, url: value }]
      }

      if (!value || typeof value !== 'object' || typeof value.url !== 'string') {
        return []
      }

      return [
        {
          path,
          url: value.url,
          description: typeof value.description === 'string' ? value.description : undefined,
        },
      ]
    })
  } catch {
    return []
  }
}

export const playableAssets = parseAssetMap(assetMapRaw)

export function getAssetsByType(type: 'images' | 'audio' | 'video' | 'other'): PlayableAsset[] {
  return playableAssets.filter((asset) => asset.path.startsWith(`${type}/`))
}

export function findAssetByDescription(keywords: string[]): PlayableAsset | undefined {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase())
  return playableAssets.find((asset) => {
    const haystack = `${asset.path} ${asset.description ?? ''}`.toLowerCase()
    return normalizedKeywords.some((keyword) => haystack.includes(keyword))
  })
}

export const firstImageAsset = getAssetsByType('images')[0]
export const firstAudioAsset = getAssetsByType('audio')[0]
export const firstVideoAsset = getAssetsByType('video')[0]
