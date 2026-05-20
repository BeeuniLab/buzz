import type {
    AssetBounds,
    InteractionZone,
    InteractionZoneRole,
    Point,
} from './asset-interactions';
import { zoneFromBounds } from './asset-interactions';

export type MediaAnnotationSource =
    | 'visual-annotation'
    | 'creator-provided'
    | 'manual'
    | 'estimated';

export type AnnotatedMediaRegion = {
    id: string;
    role: InteractionZoneRole;
    label?: string;
    bounds?: AssetBounds;
    shape?: InteractionZone['shape'];
    center?: Point;
    radius?: number;
    points?: Point[];
    padding?: number | { x?: number; y?: number };
    source?: MediaAnnotationSource;
    confidence?: number;
};

export type AnnotatedMediaZoneSet = {
    zones: InteractionZone[];
    byId: Record<string, InteractionZone>;
    byRole: Record<string, InteractionZone[]>;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function clampPoint(point: Point): Point {
    return {
        x: clamp(point.x, 0, 1),
        y: clamp(point.y, 0, 1),
    };
}

function clampBounds(bounds: AssetBounds): AssetBounds {
    const x = clamp(bounds.x, 0, 0.99);
    const y = clamp(bounds.y, 0, 0.99);
    const right = clamp(bounds.x + bounds.width, x + 0.01, 1);
    const bottom = clamp(bounds.y + bounds.height, y + 0.01, 1);

    return {
        x,
        y,
        width: right - x,
        height: bottom - y,
    };
}

function applyPadding(bounds: AssetBounds, padding: AnnotatedMediaRegion['padding']): AssetBounds {
    if (padding === undefined) return clampBounds(bounds);
    const paddingX = typeof padding === 'number' ? padding : padding.x ?? 0;
    const paddingY = typeof padding === 'number' ? padding : padding.y ?? 0;

    return clampBounds({
        x: bounds.x - paddingX,
        y: bounds.y - paddingY,
        width: bounds.width + paddingX * 2,
        height: bounds.height + paddingY * 2,
    });
}

function centerFromBounds(bounds: AssetBounds): Point {
    return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
    };
}

function boundsFromCenter(region: AnnotatedMediaRegion): AssetBounds {
    const center = clampPoint(region.center ?? { x: 0.5, y: 0.5 });
    const width = region.bounds?.width ?? Math.max(0.01, (region.radius ?? 0.08) * 2);
    const height = region.bounds?.height ?? Math.max(0.01, (region.radius ?? 0.08) * 2);

    return clampBounds({
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
    });
}

function polygonCenter(points: Point[]): Point {
    if (points.length === 0) return { x: 0.5, y: 0.5 };
    const sum = points.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
    );

    return {
        x: sum.x / points.length,
        y: sum.y / points.length,
    };
}

export function annotatedRegionToZone(region: AnnotatedMediaRegion): InteractionZone {
    const shape = region.shape ?? 'rect';
    const bounds = applyPadding(region.bounds ?? boundsFromCenter(region), region.padding);

    if (shape === 'circle') {
        const center = clampPoint(region.center ?? centerFromBounds(bounds));
        return {
            id: region.id,
            label: region.label,
            role: region.role,
            shape,
            x: center.x,
            y: center.y,
            radius: clamp(region.radius ?? Math.max(bounds.width, bounds.height) / 2, 0.005, 1),
        };
    }

    if (shape === 'polygon' && region.points && region.points.length >= 3) {
        const points = region.points.map(clampPoint);
        const center = polygonCenter(points);
        return {
            id: region.id,
            label: region.label,
            role: region.role,
            shape,
            x: center.x,
            y: center.y,
            points,
        };
    }

    return zoneFromBounds(region.id, bounds, region.role);
}

export function defineMediaInteractionZones(regions: AnnotatedMediaRegion[]): InteractionZone[] {
    return regions.map(annotatedRegionToZone);
}

export function defineMediaZoneSet(regions: AnnotatedMediaRegion[]): AnnotatedMediaZoneSet {
    const zones = defineMediaInteractionZones(regions);
    const byId: Record<string, InteractionZone> = {};
    const byRole: Record<string, InteractionZone[]> = {};

    for (const zone of zones) {
        byId[zone.id] = zone;
        const role = zone.role ?? 'target';
        byRole[role] = [...(byRole[role] ?? []), zone];
    }

    return { zones, byId, byRole };
}

export function findZoneByIdOrRole(
    zones: InteractionZone[],
    idOrRole: string,
): InteractionZone | undefined {
    return zones.find((zone) => zone.id === idOrRole || zone.role === idOrRole);
}
