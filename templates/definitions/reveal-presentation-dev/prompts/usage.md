# Usage Guide

## Overview
Runtime JSX compilation with zero build steps. Clean 3-file architecture for easy customization.

**Tech Stack:**
- React 18 + Reveal.js 5 + Babel Standalone (browser JSX compilation)
- Tailwind CSS (CDN) + Glass morphism design
- Recharts + Lucide icons
- Cloudflare Workers backend

## File Structure

**Editable (LLM writes here):**
- `public/slides/` - Slide content files (Slide01-10.jsx are examples - replace/remove them)
- `public/slides/manifest.json` - Slide order and metadata
- `public/theme-config.js` - **ALL theme customization** (gradients, typography, spacing, etc.) ~280 lines
- `public/slides-library.jsx` - All components (13 slide templates + 9 UI components) ~610 lines
- `public/slides-styles.css` - Custom CSS and Reveal.js overrides ~450 lines

**Reference (read-only):**
- `public/lib/chartTheme.jsx` - Recharts configuration

**Hidden (dev infrastructure):**
- `public/_dev/` - Runtime compiler, loaders (do not modify)

## Customization Philosophy

**To change the entire theme:** Edit `theme-config.js` - single source of truth for:
- Color gradients (12 presets: purple, blue, green, etc.)
- Typography scale (hero, display, h2, h3, body, caption)
- Spacing, padding, margins
- Grid layouts, icon sizes, shadows
- Glass morphism effects

**To edit components:** Edit `slides-library.jsx` - all slide templates and UI components

**To add custom CSS:** Edit `slides-styles.css` - Reveal.js overrides and animations

## Quick Start

### 1. Import Pattern
Slides import from `/slides-library.jsx` and optionally `/theme-config.js`:
```jsx
import { TitleSlide, GlassCard, Fragment } from '/slides-library.jsx'
import { GRADIENT_CLASSES, THEME } from '/theme-config.js'
import { Sparkles } from 'lucide-react'
import { BarChart, Bar } from 'recharts'
```

### 2. Slide Structure
```jsx
// Slide files must export default function
export default function SlideXX() {
  return <TitleSlide title="..." gradient="blue" />
}
```

**Rules:**
- Pure JSX only (no TypeScript)
- File naming: `Slide01.jsx`, `Slide02.jsx`, etc.
- Place in `public/slides/` directory

### 3. Slide Order
Edit `public/slides/manifest.json`:
```json
{
  "slides": ["Slide01.jsx", "Slide03.jsx", "Slide02.jsx"],
  "metadata": { "title": "My Presentation", "theme": "dark" }
}
```
- Manifest controls order
- Unmapped slides auto-sorted by number
- No manifest = auto-discovery Slide01-99

## Component Library (`/slides-library.jsx`)

### Slide Templates (13 total)
See example slides (Slide01-11.jsx) for usage patterns:
- `TitleSlide` - Opening slide with icon, gradient backdrop (Slide01)
- `ContentSlide` - Simple content layout (Slide02)
- `ListSlide` - Bullet points with icons (Slide03)
- `TwoColumnSlide` - Side-by-side content (Slide04, Slide09)
- `QuoteSlide` - Quote with attribution (Slide05)
- `CodeSlide` - Syntax highlighted code (Slide06)
- `StatsSlide` - Grid of statistics (Slide07)
- `SectionSlide` - Section divider with gradient (Slide08)
- `TimelineSlide` - Vertical timeline (Slide11)
- `CallToActionSlide` - CTA with button (Slide10 - closing slide)
- `ComparisonSlide` - Table comparison (not in examples)
- `ImageSlide` - Image with caption (not in examples)
- `FullImageSlide` - Full-screen background image (not in examples)

### UI Components (9 total)
- `GlassCard` - Glass morphism container
- `GradientText` - Gradient colored text
- `GradientBox` - Icon/number container with gradient
- `Fragment` - Reveal.js animation wrapper
- `Divider` - Horizontal line
- `SlideContainer`, `SlideTitle`, `IconBadge`, `GradientBackdrop` - Layout utilities

### Utilities & Constants
- `cn()` - Tailwind class merger
- `gradient(name, strong?)` - Get gradient classes from theme
- `text(size, weight, spacing)` - Build typography classes
- `gap()`, `margin()`, `radius()`, `shadow()` - Spacing/styling helpers
- `GRADIENT_CLASSES`, `GRID_COLUMNS`, `ICON_SIZES` - Constants

## Customizing the Theme

**Everything in `theme-config.js`** - edit the `THEME` object to customize:

```javascript
// Add a new gradient
THEME.gradients.sunset = {
  light: 'from-orange-400 to-pink-400',
  strong: 'from-orange-600 via-red-600 to-pink-600'
}

// Adjust typography scale
THEME.fontSize.hero = 'text-9xl'  // Bigger titles

// Change spacing
THEME.padding.section.x = 'px-24'  // More horizontal padding

// Modify glass effects
THEME.glass.intensity.light = 'glass-custom'  // Use custom CSS class
```

Then use in slides:
```jsx
<TitleSlide gradient="sunset" />  // Uses new gradient
```

## Common Patterns

### Gradients
12 available: `purple`, `blue`, `green`, `orange`, `pink`, `red`, `indigo`, `teal`, `amber`, `rose`, `violet`, `emerald`

```jsx
<TitleSlide gradient="purple" />
<GradientText gradient="blue" strong>Text</GradientText>
```

### Animations (Fragment)
```jsx
import { Fragment } from '/slides-library.jsx'

<Fragment type="fade-up" index={0}>
  <GlassCard>Appears on click</GlassCard>
</Fragment>
```
Types: `fade-up`, `fade-down`, `fade-left`, `fade-right`, `fade-in`, `fade-out`, `zoom-in`, `fade-in-then-semi-out`

### Charts (Recharts)
```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const data = [{ name: 'A', value: 100 }]

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <XAxis dataKey="name" stroke="#fff" />
    <Bar dataKey="value" fill="#3b82f6" />
  </BarChart>
</ResponsiveContainer>
```

For styled charts, import from `/lib/chartTheme.jsx`:
```jsx
import { chartTheme, createChartGradients } from '/lib/chartTheme.jsx'

<BarChart data={data}>
  {createChartGradients()}
  <CartesianGrid {...chartTheme.grid} />
</BarChart>
```

### Icons (Lucide)
```jsx
import { Sparkles, Check, Rocket, Users, TrendingUp } from 'lucide-react'

<Sparkles size={80} className="text-purple-400" />
```

## Styling

**Use component library:**
- `GlassCard` for containers (not custom divs)
- `GradientBox` for icons/numbers
- `GradientText` for colored text

**Tailwind for layout:**
- `flex`, `grid`, `p-6`, `gap-4`, `text-3xl`, `mb-8`
- Responsive: `md:text-4xl`, `lg:grid-cols-3`

**Custom styles:**
- Add to `public/slides-styles.css`
- Semantic classes: `.slide-title`, `.slide-heading`, `.slide-caption`, `.glass`

## Important Notes

**Example Slides:**
All slides in `public/slides/` (Slide01-11.jsx) are examples showing different templates. Replace or remove them when creating your presentation.

**Development:**
- Runtime compilation (no build step)
- Refresh browser to see changes
- Do NOT modify `public/_dev/`, configs, or `worker/`

**Common Imports:**
```jsx
// Slide templates & UI
import { TitleSlide, GlassCard, Fragment } from '/slides-library.jsx'

// Icons
import { Sparkles, Check, Rocket } from 'lucide-react'

// Charts
import { BarChart, Bar } from 'recharts'

// Chart themes (optional)
import { chartTheme } from '/lib/chartTheme.jsx'
```
