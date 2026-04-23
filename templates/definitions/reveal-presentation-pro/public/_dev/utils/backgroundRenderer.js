/**
 * Default gradient definitions (fallback if theme not loaded)
 */
const DEFAULT_GRADIENTS = {
  purple: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  blue: 'linear-gradient(135deg, #667eea 0%, #4c51bf 100%)',
  emerald: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  violet: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  cyan: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
  pink: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  orange: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  red: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  yellow: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
  green: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  teal: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
  indigo: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
};

/**
 * Get gradient registry (theme gradients if available, otherwise defaults)
 */
function getGradientsRegistry() {
  // Current template does not use external theme configuration.
  // Always fall back to the default gradients defined above.
  return DEFAULT_GRADIENTS;
}

/**
 * Renders a CSS background value from slide background config
 */
export function renderBackground(background) {
  if (!background) {
    return 'transparent';
  }

  switch (background.type) {
    case 'solid':
      return background.value;

    case 'gradient':
      // Check if it's a named gradient from theme
      const gradients = getGradientsRegistry();
      if (gradients[background.value]) {
        return gradients[background.value];
      }
      // Otherwise treat as CSS gradient string
      return background.value;

    case 'image':
      return `url(${background.value}) center/cover no-repeat`;

    default:
      return 'transparent';
  }
}

/**
 * Renders a text gradient (for gradient text effect)
 */
export function renderTextGradient(gradientName) {
  const gradients = getGradientsRegistry();
  const gradient = gradients[gradientName] || gradientName;

  return {
    background: gradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };
}

/**
 * Get gradient CSS string by name
 */
export function getGradient(name) {
  const gradients = getGradientsRegistry();
  return gradients[name] || name;
}
