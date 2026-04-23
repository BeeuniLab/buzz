/**
 * JSON Schema for Reveal Presentation Pro
 *
 * This schema defines JSON-based slides that are rendered to React elements.
 * - Uses semantic HTML element types (h1, h2, div, p, span)
 * - Styled with Tailwind CSS classes via className
 * - Supports nested children for tree structure
 * - Icons rendered via Lucide React (type: 'svg')
 *
 * Example slide structure:
 * ```json
 * {
 *   "id": "slide01",
 *   "root": {
 *     "type": "div",
 *     "className": "flex flex-col h-full p-20",
 *     "children": [
 *       {
 *         "type": "h1",
 *         "className": "slide-title-fluorescent",
 *         "text": "Welcome"
 *       }
 *     ]
 *   }
 * }
 * ```
 */

/**
 * Valid HTML element types for slide elements.
 * - Use h1-h4 for headings
 * - Use p for paragraphs
 * - Use span for inline text with styling
 * - Use div for containers and layout
 * - Use svg for Lucide icons
 */
export type ElementType =
  | 'section'
  | 'div'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'p'
  | 'span'
  | 'ul'
  | 'li'
  | 'a'
  | 'svg';

export interface BaseElement {
  /** HTML element type */
  type: ElementType;

  /** Tailwind CSS classes */
  className?: string;

  /** Nested children */
  children?: SlideElement[];

  /** Text content (for text nodes and simple elements) */
  text?: string;

  /** Accessibility attributes */
  role?: string;
  ariaLevel?: string;

  /** Reveal.js fragment attributes */
  'data-fragment-index'?: number;

  /** Reveal.js transition attribute */
  'data-transition'?: string;

  /** Props for rich components */
  props?: Record<string, any>;
}

export interface SVGElement extends BaseElement {
  type: 'svg';

  /** Lucide icon name */
  icon: string;

  /** Icon size in pixels */
  size?: number;
}

export type SlideElement = BaseElement | SVGElement;

/**
 * Background animation speed
 */
export type AnimationSpeed = 'none' | 'slow' | 'medium' | 'fast';

/**
 * Background configuration for dynamic slide backgrounds
 */
export interface SlideBackground {
  /** Background type */
  type: 'mesh' | 'particles' | 'mesh-particles' | 'gradient' | 'solid';

  /** Color(s) for the background (array for mesh/gradient, string for solid/particles) */
  colors?: string[];
  color?: string;

  /** Animation speed */
  animation?: AnimationSpeed;

  /** Particle count (for particle backgrounds) */
  count?: number;

  /** Particle speed (for particle backgrounds) */
  speed?: AnimationSpeed;
}

export interface SlideData {
  /** Unique slide identifier */
  id: string;

  /** Root element (usually a section) */
  root: SlideElement;

  /** Optional slide metadata */
  metadata?: {
    title?: string;
    notes?: string;
    /** Dynamic background configuration */
    background?: SlideBackground;
  };
}

/**
 * Manifest structure
 */
export interface Manifest {
  slides: string[];
  metadata?: {
    title?: string;
    theme?: string;
    transition?: string;
  };
}
