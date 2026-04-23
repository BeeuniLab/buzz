import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// ==================== THEME CONFIGURATION ====================
// Single source of truth for all visual customization

export const THEME = {
  // Color Gradients (12 total)
  gradients: {
    purple: {
      light: 'from-purple-400 to-pink-400',
      strong: 'from-purple-600 via-pink-600 to-red-600'
    },
    blue: {
      light: 'from-blue-400 to-cyan-400',
      strong: 'from-blue-600 via-cyan-600 to-teal-600'
    },
    green: {
      light: 'from-green-400 to-emerald-400',
      strong: 'from-green-600 via-emerald-600 to-teal-600'
    },
    orange: {
      light: 'from-orange-400 to-red-400',
      strong: 'from-orange-600 via-red-600 to-pink-600'
    },
    pink: {
      light: 'from-pink-400 to-rose-400',
      strong: 'from-pink-600 via-purple-600 to-indigo-600'
    },
    red: {
      light: 'from-red-400 to-rose-400',
      strong: 'from-red-600 via-rose-600 to-pink-600'
    },
    indigo: {
      light: 'from-indigo-400 to-purple-400',
      strong: 'from-indigo-600 via-purple-600 to-blue-600'
    },
    teal: {
      light: 'from-teal-400 to-cyan-400',
      strong: 'from-teal-600 via-cyan-600 to-blue-600'
    },
    amber: {
      light: 'from-amber-400 to-orange-400',
      strong: 'from-amber-600 via-orange-600 to-red-600'
    },
    rose: {
      light: 'from-rose-400 to-pink-400',
      strong: 'from-rose-600 via-pink-600 to-purple-600'
    },
    violet: {
      light: 'from-violet-400 to-fuchsia-400',
      strong: 'from-violet-600 via-purple-600 to-fuchsia-600'
    },
    emerald: {
      light: 'from-emerald-400 to-green-400',
      strong: 'from-emerald-600 via-green-600 to-cyan-600'
    },
  },

  // Typography Scale
  fontSize: {
    hero: 'text-8xl',      // 6rem (96px) - Opening slides
    display: 'text-7xl',   // 4.5rem (72px) - Section headers
    h2: 'text-5xl',        // 3rem (48px) - Slide titles
    h3: 'text-4xl',        // 2.25rem (36px) - Subheadings
    h4: 'text-3xl',        // 1.875rem (30px) - Body/lists
    body: 'text-3xl',      // 1.875rem (30px) - Default text
    caption: 'text-xl',    // 1.25rem (20px) - Small text
  },

  fontWeight: {
    light: 'font-light',       // 300
    normal: 'font-normal',     // 400
    medium: 'font-medium',     // 500
    semibold: 'font-semibold', // 600
    bold: 'font-bold',         // 700
    black: 'font-black',       // 900
  },

  lineHeight: {
    tight: 'leading-tight',     // 1.25
    snug: 'leading-snug',       // 1.375
    normal: 'leading-normal',   // 1.5
    relaxed: 'leading-relaxed', // 1.625
    loose: 'leading-loose',     // 2
  },

  letterSpacing: {
    tight: 'tracking-tight',   // -0.025em
    normal: 'tracking-normal', // 0
    wide: 'tracking-wide',     // 0.025em
  },

  // Color Palette
  colors: {
    text: {
      primary: 'text-gray-100',   // rgb(243 244 246)
      secondary: 'text-gray-400', // rgb(156 163 175)
      muted: 'text-gray-500',     // rgb(107 114 128)
    },
    bg: {
      default: '',
      gradient: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
      subtle: 'bg-slate-800/50',
    },
  },

  // Spacing Scale
  spacing: {
    xs: 'gap-2',       // 0.5rem
    sm: 'gap-3',       // 0.75rem
    md: 'gap-5',       // 1.25rem
    lg: 'gap-8',       // 2rem
    xl: 'gap-10',      // 2.5rem
    '2xl': 'gap-16',   // 4rem
  },

  margin: {
    xs: 'mb-2',   // 0.5rem
    sm: 'mb-4',   // 1rem
    md: 'mb-6',   // 1.5rem
    lg: 'mb-8',   // 2rem
    xl: 'mb-10',  // 2.5rem
    '2xl': 'mb-16', // 4rem
  },

  padding: {
    section: {
      x: 'px-20',      // Horizontal padding for slides
      y: 'py-16',      // Vertical padding for slides
      centerX: 'px-32', // Centered slide horizontal padding
    },
    badge: {
      sm: 'p-6',
      md: 'p-7',
      lg: 'p-8',
    },
  },

  // Border Radius
  radius: {
    sm: 'rounded-md',   // 0.375rem
    md: 'rounded-lg',   // 0.5rem
    lg: 'rounded-xl',   // 0.75rem
    xl: 'rounded-2xl',  // 1rem
    full: 'rounded-full', // 9999px
  },

  // Grid Layouts
  grid: {
    cols: {
      1: 'grid-cols-1',
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-4',
    },
    ratio: {
      '1:1': 'grid-cols-2',
      '1:2': 'grid-cols-[1fr_2fr]',
      '2:1': 'grid-cols-[2fr_1fr]',
    },
  },

  // Icon Sizes
  icon: {
    classes: {
      small: 'w-6 h-6',
      medium: 'w-8 h-8',
      large: 'w-10 h-10',
    },
    sizes: {
      hero: 80,
      large: 40,
      medium: 32,
      small: 24,
    },
  },

  // Glass Morphism Effects
  glass: {
    intensity: {
      light: 'glass',
      medium: 'glass-medium',
      strong: 'glass-strong',
    },
  },

  // Shadow Effects
  shadow: {
    sm: 'shadow-elevation-sm',
    md: 'shadow-elevation-md',
    lg: 'shadow-elevation-lg',
    xl: 'shadow-elevation-xl',
    glowSm: 'shadow-glow-sm',
    glowMd: 'shadow-glow-md',
  },

  // Backdrop Overlay Effects
  overlay: {
    light: 'bg-white/25 backdrop-blur-sm',
    dark: 'bg-black/40 backdrop-blur-sm',
    gradient: 'bg-gradient-to-t from-black/70 via-black/30 to-transparent',
    none: '',
  },

  // Backdrop Intensity
  backdropIntensity: {
    subtle: 'opacity-12',
    medium: 'opacity-15',
    strong: 'opacity-20',
  },

  // Position Classes
  position: {
    top: 'items-start pt-20',
    center: 'items-center',
    bottom: 'items-end pb-20',
  },
}

// ==================== UTILITY FUNCTIONS ====================

// Tailwind class merger (handles conflicts)
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Get gradient classes
export function gradient(name, strong = false) {
  const type = strong ? 'strong' : 'light'
  return THEME.gradients[name]?.[type] ?? THEME.gradients.blue[type]
}

// Build text classes with size, weight, spacing
export function text(size, weight, spacing) {
  const classes = []

  if (size && THEME.fontSize[size]) {
    classes.push(THEME.fontSize[size])
  }

  if (weight && THEME.fontWeight[weight]) {
    classes.push(THEME.fontWeight[weight])
  }

  if (spacing && THEME.letterSpacing[spacing]) {
    classes.push(THEME.letterSpacing[spacing])
  }

  return classes.join(' ')
}

// Get spacing/gap classes
export function gap(size) {
  return THEME.spacing[size] ?? THEME.spacing.lg
}

// Get margin classes
export function margin(size) {
  return THEME.margin[size] ?? THEME.margin.md
}

// Get border radius
export function radius(size) {
  return THEME.radius[size] ?? THEME.radius.lg
}

// Get grid columns
export function gridCols(n) {
  return THEME.grid.cols[n] ?? THEME.grid.cols[3]
}

// Get grid ratio
export function gridRatio(ratio) {
  return THEME.grid.ratio[ratio] ?? THEME.grid.ratio['1:1']
}

// Get icon size classes
export function iconSize(size) {
  return THEME.icon.classes[size] ?? THEME.icon.classes.medium
}

// Get shadow classes
export function shadow(level) {
  return THEME.shadow[level] ?? THEME.shadow.md
}

// ==================== EXPORTS ====================

// Export for backwards compatibility with old code
export const GRADIENT_CLASSES = Object.fromEntries(
  Object.entries(THEME.gradients).map(([key, value]) => [key, value.light])
)

export const GRADIENT_CLASSES_STRONG = Object.fromEntries(
  Object.entries(THEME.gradients).map(([key, value]) => [key, value.strong])
)

export const GRID_COLUMNS = THEME.grid.cols
export const GRID_RATIOS = THEME.grid.ratio
export const ICON_SIZE_CLASSES = THEME.icon.classes
export const ICON_SIZES = THEME.icon.sizes
