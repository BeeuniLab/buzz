import type { GameObjects, Scene } from 'phaser';

export type Point = { x: number; y: number };

export type InteractionZoneRole =
    | 'target'
    | 'drop-zone'
    | 'tap-target'
    | 'drag-handle'
    | 'character'
    | 'mouth'
    | 'face'
    | 'decoration'
    | string;

export type InteractionZoneShape = 'rect' | 'circle' | 'polygon';

export type InteractionZone = {
    id: string;
    label?: string;
    role?: InteractionZoneRole;
    shape: InteractionZoneShape;
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    points?: Point[];
};

export type AssetBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type AssetImageAnalysis = {
    width: number;
    height: number;
    visibleBounds: AssetBounds;
    visibleCenter: Point;
    visibleCoverage: number;
};

export type AssetPlacement = AssetBounds & {
    sourceWidth: number;
    sourceHeight: number;
    scale: number;
};

export type FitMode = 'contain' | 'cover';

export type FitImageOptions = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    mode?: FitMode;
    maxScale?: number;
    minScale?: number;
};

export type ZoneDebugStyle = {
    strokeColor?: number;
    fillColor?: number;
    strokeAlpha?: number;
    fillAlpha?: number;
    lineWidth?: number;
};

const DEFAULT_DEBUG_STYLE: Required<ZoneDebugStyle> = {
    strokeColor: 0xffd23f,
    fillColor: 0xffd23f,
    strokeAlpha: 0.85,
    fillAlpha: 0.14,
    lineWidth: 4,
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getImageSourceSize(image: GameObjects.Image): { width: number; height: number } {
    return {
        width: Math.max(1, image.width || image.displayWidth || 1),
        height: Math.max(1, image.height || image.displayHeight || 1),
    };
}

export function fitImageToScene(
    scene: Scene,
    image: GameObjects.Image,
    options: FitImageOptions = {},
): AssetPlacement {
    const source = getImageSourceSize(image);
    const targetWidth = options.width ?? scene.scale.width;
    const targetHeight = options.height ?? scene.scale.height;
    const fitScale = options.mode === 'cover'
        ? Math.max(targetWidth / source.width, targetHeight / source.height)
        : Math.min(targetWidth / source.width, targetHeight / source.height);
    const scale = clamp(fitScale, options.minScale ?? 0, options.maxScale ?? Number.POSITIVE_INFINITY);
    const width = source.width * scale;
    const height = source.height * scale;
    const x = options.x ?? scene.scale.width / 2;
    const y = options.y ?? scene.scale.height / 2;

    image.setPosition(x, y);
    image.setDisplaySize(width, height);

    return {
        x: x - width / 2,
        y: y - height / 2,
        width,
        height,
        sourceWidth: source.width,
        sourceHeight: source.height,
        scale,
    };
}

export function normalizedZone(
    id: string,
    zone: Omit<InteractionZone, 'id'>,
): InteractionZone {
    return { id, ...zone };
}

export function imagePointToWorld(placement: AssetPlacement, point: Point): Point {
    return {
        x: placement.x + point.x * placement.width,
        y: placement.y + point.y * placement.height,
    };
}

export function worldPointToImage(placement: AssetPlacement, point: Point): Point {
    return {
        x: (point.x - placement.x) / placement.width,
        y: (point.y - placement.y) / placement.height,
    };
}

export function zoneToWorld(placement: AssetPlacement, zone: InteractionZone): InteractionZone {
    const origin = imagePointToWorld(placement, { x: zone.x, y: zone.y });
    const points = zone.points?.map((point) => imagePointToWorld(placement, point));

    return {
        ...zone,
        x: origin.x,
        y: origin.y,
        width: zone.width === undefined ? undefined : zone.width * placement.width,
        height: zone.height === undefined ? undefined : zone.height * placement.height,
        radius: zone.radius === undefined ? undefined : zone.radius * Math.min(placement.width, placement.height),
        points,
    };
}

export function zonesToWorld(placement: AssetPlacement, zones: InteractionZone[]): InteractionZone[] {
    return zones.map((zone) => zoneToWorld(placement, zone));
}

export function pointInZone(zone: InteractionZone, point: Point): boolean {
    if (zone.shape === 'circle') {
        const radius = zone.radius ?? 0;
        const dx = point.x - zone.x;
        const dy = point.y - zone.y;
        return dx * dx + dy * dy <= radius * radius;
    }

    if (zone.shape === 'polygon' && zone.points && zone.points.length >= 3) {
        let inside = false;
        for (let i = 0, j = zone.points.length - 1; i < zone.points.length; j = i++) {
            const a = zone.points[i];
            const b = zone.points[j];
            const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
                (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    const width = zone.width ?? 0;
    const height = zone.height ?? 0;
    return (
        point.x >= zone.x - width / 2 &&
        point.x <= zone.x + width / 2 &&
        point.y >= zone.y - height / 2 &&
        point.y <= zone.y + height / 2
    );
}

export function findZoneAtPoint(zones: InteractionZone[], point: Point): InteractionZone | undefined {
    return zones.find((zone) => pointInZone(zone, point));
}

export function drawInteractionZones(
    scene: Scene,
    zones: InteractionZone[],
    style: ZoneDebugStyle = {},
): GameObjects.Graphics {
    const resolved = { ...DEFAULT_DEBUG_STYLE, ...style };
    const graphics = scene.add.graphics();

    graphics.lineStyle(resolved.lineWidth, resolved.strokeColor, resolved.strokeAlpha);
    graphics.fillStyle(resolved.fillColor, resolved.fillAlpha);

    for (const zone of zones) {
        if (zone.shape === 'circle') {
            const radius = zone.radius ?? 0;
            graphics.fillCircle(zone.x, zone.y, radius);
            graphics.strokeCircle(zone.x, zone.y, radius);
        } else if (zone.shape === 'polygon' && zone.points && zone.points.length >= 3) {
            graphics.beginPath();
            graphics.moveTo(zone.points[0].x, zone.points[0].y);
            for (const point of zone.points.slice(1)) {
                graphics.lineTo(point.x, point.y);
            }
            graphics.closePath();
            graphics.fillPath();
            graphics.strokePath();
        } else {
            const width = zone.width ?? 0;
            const height = zone.height ?? 0;
            graphics.fillRect(zone.x - width / 2, zone.y - height / 2, width, height);
            graphics.strokeRect(zone.x - width / 2, zone.y - height / 2, width, height);
        }
    }

    return graphics;
}

export function makeCenteredZone(
    id: string,
    role: InteractionZoneRole,
    width = 0.28,
    height = 0.22,
): InteractionZone {
    return {
        id,
        role,
        shape: 'rect',
        x: 0.5,
        y: 0.5,
        width,
        height,
    };
}

export function zoneFromBounds(
    id: string,
    bounds: AssetBounds,
    role: InteractionZoneRole = 'target',
): InteractionZone {
    return {
        id,
        role,
        shape: 'rect',
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        width: bounds.width,
        height: bounds.height,
    };
}

export function visibleBoundsZone(
    id: string,
    analysis: AssetImageAnalysis,
    role: InteractionZoneRole = 'target',
): InteractionZone {
    return zoneFromBounds(id, analysis.visibleBounds, role);
}

export function makeGridZones(columns: number, rows: number, role: InteractionZoneRole = 'tap-target'): InteractionZone[] {
    const zones: InteractionZone[] = [];
    const cellWidth = 1 / columns;
    const cellHeight = 1 / rows;

    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            zones.push({
                id: `cell-${column}-${row}`,
                role,
                shape: 'rect',
                x: (column + 0.5) * cellWidth,
                y: (row + 0.5) * cellHeight,
                width: cellWidth,
                height: cellHeight,
            });
        }
    }

    return zones;
}

export async function loadImageForAnalysis(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Could not load image for analysis: ${url}`));
    });

    image.src = url;
    await loaded;
    return image;
}

export function analyzeImageElement(
    image: HTMLImageElement,
    alphaThreshold = 8,
    maxAnalysisSize = 512,
): AssetImageAnalysis {
    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(1, maxAnalysisSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        return {
            width: sourceWidth,
            height: sourceHeight,
            visibleBounds: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
            visibleCenter: { x: 0.5, y: 0.5 },
            visibleCoverage: 1,
        };
    }

    context.drawImage(image, 0, 0, width, height);
    let data: Uint8ClampedArray;
    try {
        data = context.getImageData(0, 0, width, height).data;
    } catch {
        return {
            width: sourceWidth,
            height: sourceHeight,
            visibleBounds: { x: 0, y: 0, width: 1, height: 1 },
            visibleCenter: { x: 0.5, y: 0.5 },
            visibleCoverage: 1,
        };
    }
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let visiblePixels = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha <= alphaThreshold) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            visiblePixels++;
        }
    }

    if (visiblePixels === 0) {
        minX = 0;
        minY = 0;
        maxX = width - 1;
        maxY = height - 1;
    }

    const normalizedBounds = {
        x: minX / width,
        y: minY / height,
        width: (maxX - minX + 1) / width,
        height: (maxY - minY + 1) / height,
    };

    return {
        width: sourceWidth,
        height: sourceHeight,
        visibleBounds: normalizedBounds,
        visibleCenter: {
            x: normalizedBounds.x + normalizedBounds.width / 2,
            y: normalizedBounds.y + normalizedBounds.height / 2,
        },
        visibleCoverage: visiblePixels / (width * height),
    };
}

export async function analyzeImageUrl(url: string): Promise<AssetImageAnalysis> {
    return analyzeImageElement(await loadImageForAnalysis(url));
}
