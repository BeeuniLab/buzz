import { z } from 'zod';

const allowedElementTypes = [
    'div', 'section', 'article', 'aside', 'header', 'footer',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'ul', 'ol', 'li',
    'button', 'a', 'img', 'code', 'pre', 'blockquote', 'svg',
    // Recharts
    'BarChart', 'LineChart', 'AreaChart', 'PieChart', 'RadarChart', 'ResponsiveContainer',
    'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'Bar', 'Line', 'Area', 'Pie', 'Radar',
    'PolarGrid', 'PolarAngleAxis', 'PolarRadiusAxis', 'Cell',
    // Slide Templates
    'StatCard', 'GlassCard', 'IconBadge', 'Timeline', 'Comparison', 'CodeBlock', 'Icon'
];

const styleKeys = [
    'position', 'left', 'top', 'right', 'bottom', 'zIndex',
    'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight',
    'color', 'background', 'backgroundColor', 'backgroundImage', 'borderRadius',
    'boxShadow', 'padding', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
    'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom',
    'transform', 'opacity', 'backdropFilter',
    'fontSize', 'gap'
];

const StyleSchema = z.record(z.string(), z.any()).refine((obj) => {
    return Object.keys(obj).every((k) => styleKeys.includes(k));
}, { message: 'Invalid style key' });

const SVGElementSchema = z.object({
    type: z.literal('svg'),
    id: z.string().optional(),
    icon: z.string(),
    size: z.number().optional(),
    className: z.string().optional(),
    props: z.record(z.string(), z.any()).optional(),
    _streaming: z.boolean().optional(),
});

const SlideElementSchema = z.lazy(() => z.union([
    SVGElementSchema,
    z.object({
        type: z.string().refine((t) => allowedElementTypes.includes(t) && t !== 'svg', { message: 'Invalid element type' }),
        id: z.string().optional(),
        className: z.string().optional(),
        text: z.string().optional(),
        props: z.record(z.string(), z.any()).optional(),
        children: z.array(SlideElementSchema).optional(),
        style: StyleSchema.optional(),
        role: z.string().optional(),
        ariaLevel: z.string().optional(),
        'data-fragment-index': z.number().optional(),
        'data-transition': z.string().optional(),
        _streaming: z.boolean().optional(),
    })
]));

const CanvasSchema = z.object({ width: z.number().optional(), height: z.number().optional() }).partial();

const BackgroundSchema = z.object({
    type: z.enum(['mesh', 'particles', 'mesh-particles', 'gradient', 'solid']),
    colors: z.array(z.string()).optional(),
    color: z.string().optional(),
    animation: z.enum(['none', 'slow', 'medium', 'fast']).optional(),
    count: z.number().optional(),
    speed: z.enum(['none', 'slow', 'medium', 'fast']).optional(),
}).optional();

export const SlideSchema = z.object({
    id: z.string(),
    canvas: CanvasSchema.default({ width: 1920, height: 1080 }),
    root: SlideElementSchema,
    metadata: z.object({
        title: z.string().optional(),
        notes: z.string().optional(),
        background: BackgroundSchema,
    }).optional(),
});

export const slideValidator = (data) => {
    const result = SlideSchema.safeParse(data);
    if (!result.success) {
        throw result.error;
    }
    return result.data;
};

export const sanitizeSlideTree = (slide) => {
    const sanitizeNode = (node) => {
        if (!node) return null;
        const clean = { type: node.type };
        if (node.className) clean.className = node.className;
        if (node.id) clean.id = node.id;
        if (node.text) clean.text = node.text;
        if (node.props) clean.props = node.props;
        if (node.icon) clean.icon = node.icon;
        if (node.size !== undefined) clean.size = node.size;
        if (node.role) clean.role = node.role;
        if (node.ariaLevel) clean.ariaLevel = node.ariaLevel;
        if (node['data-fragment-index'] !== undefined) clean['data-fragment-index'] = node['data-fragment-index'];
        if (node['data-transition']) clean['data-transition'] = node['data-transition'];
        if (node.style) {
            clean.style = Object.fromEntries(
                Object.entries(node.style).filter(([k]) => styleKeys.includes(k))
            );
        }
        if (node.children && Array.isArray(node.children)) {
            clean.children = node.children.map(sanitizeNode).filter(Boolean);
        }
        if (node._streaming) clean._streaming = true;
        return clean;
    };

    const sanitized = {
        ...slide,
        root: sanitizeNode(slide.root),
    };

    if (slide.metadata) {
        sanitized.metadata = {
            ...slide.metadata,
            background: slide.metadata.background || undefined
        };
    }

    return sanitized;
};

/**
 * AUTO-WRAP FEATURE (Load-time)
 * Automatically injects wrapper divs for layout-* classes to fix common LLM-generated layout issues.
 */
const LAYOUT_CLASS_REGEX = /\b(layout-center|layout-split|layout-default)\b/;

function autoFixLayout(slide) {
    if (!slide || !slide.root) return slide;

    const root = slide.root;
    const layoutMatch = root.className?.match(LAYOUT_CLASS_REGEX);

    if (!layoutMatch) return slide;

    const layoutType = layoutMatch[0];
    const children = root.children || [];

    if (children.length === 0) return slide;

    // Handle layout-center and layout-default
    if (layoutType === 'layout-center' || layoutType === 'layout-default') {
        if (children.length === 1) {
            const child = children[0];
            // Check if already properly wrapped
            if (
                child.type === 'div' &&
                child.className?.includes('flex-col') &&
                (child.className?.includes('flex-center') || child.className?.includes('justify-center')) &&
                !child.text
            ) {
                return slide;
            }
        }

        // Wrap all children in a single container
        console.debug(`[AutoWrap] Fixing ${layoutType} for slide ${slide.id}`);
        const wrapper = {
            type: 'div',
            className: 'flex-col flex-center gap-6',
            children: children,
            id: `${root.id || slide.id}-autowrap`
        };

        return {
            ...slide,
            root: {
                ...root,
                children: [wrapper]
            }
        };
    }

    // Handle layout-split
    if (layoutType === 'layout-split') {
        // If exactly 2 children, check if they are already columns
        if (children.length === 2) {
            const bothAreColumns = children.every(child =>
                child.type === 'div' &&
                !child.text &&
                (child.children?.length > 0 || child.props)
            );
            if (bothAreColumns) return slide;
        }

        // Wrap each child in a column container
        console.debug(`[AutoWrap] Fixing ${layoutType} for slide ${slide.id}`);

        const newChildren = children.map((child, idx) => ({
            type: 'div',
            className: 'flex-col flex-center gap-6 w-full h-full',
            children: [child],
            id: `${root.id || slide.id}-col-${idx}`
        }));

        return {
            ...slide,
            root: {
                ...root,
                children: newChildren
            }
        };
    }

    return slide;
}

// Export a wrapper that validates AND fixes
export const validateAndFixSlide = (data) => {
    try {
        const validated = slideValidator(data);
        const sanitized = sanitizeSlideTree(validated);
        return autoFixLayout(sanitized);
    } catch (error) {
        console.warn('[SlideValidation] Validation failed, attempting auto‑fix:', error);
        // Try to coerce missing fields into sensible defaults before giving up
        const attemptFix = (slide) => {
            const fixed = { ...slide };
            if (!fixed.root) fixed.root = {};
            // Default missing type to 'div'
            if (!fixed.root.type) fixed.root.type = 'div';
            // If type is 'svg' but icon missing, provide a generic placeholder icon
            if (fixed.root.type === 'svg' && !fixed.root.icon) fixed.root.icon = 'Placeholder';
            return fixed;
        };
        try {
            const coerced = attemptFix(data);
            const revalidated = slideValidator(coerced);
            const sanitized = sanitizeSlideTree(revalidated);
            return autoFixLayout(sanitized);
        } catch (e) {
            console.warn('[SlideValidation] Auto‑fix also failed, falling back to safe placeholder:', e);
            const placeholderId = data && data.id ? data.id : `fallback-${Date.now()}`;
            const placeholderSlide = {
                id: placeholderId,
                canvas: { width: 1920, height: 1080 },
                root: {
                    type: 'div',
                    className: 'flex items-center justify-center h-full w-full bg-gray-100',
                    children: [
                        {
                            type: 'p',
                            text: 'Invalid slide content',
                            className: 'text-gray-500',
                        },
                    ],
                },
                metadata: {},
            };
            return autoFixLayout(placeholderSlide);
        }
    }
};
