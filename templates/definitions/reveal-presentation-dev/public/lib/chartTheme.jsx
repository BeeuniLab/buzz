/**
 * Chart theme configuration for Recharts
 * Provides consistent styling for data visualizations
 * @module chartTheme
 */

/**
 * Dark theme configuration for Recharts components
 */
export const chartTheme = {
  tooltip: {
    contentStyle: {
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      borderRadius: '12px',
      padding: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    },
    itemStyle: {
      color: '#ffffff',
      fontSize: '14px',
      padding: '2px 0',
    },
    labelStyle: {
      color: '#a78bfa',
      fontWeight: 'bold',
      marginBottom: '8px',
    },
    cursor: {
      fill: 'rgba(139, 92, 246, 0.1)',
    },
  },
  legend: {
    wrapperStyle: {
      paddingTop: '20px',
    },
    iconType: 'circle',
  },
  grid: {
    strokeDasharray: '3 3',
    stroke: '#ffffff15',
    vertical: false,
  },
  axis: {
    stroke: '#ffffff90',
    tick: {
      fill: '#ffffff90',
      fontSize: 14,
    },
    axisLine: {
      stroke: '#ffffff20',
    },
    tickLine: {
      stroke: '#ffffff20',
    },
  },
  bar: {
    radius: [8, 8, 0, 0],
  },
}

/**
 * Predefined gradient definitions for chart bars
 * Use with <defs> in chart SVG
 */
export const chartGradients = {
  revenue: {
    id: 'revenueGradient',
    stops: [
      { offset: '0%', color: '#8b5cf6', opacity: 0.9 },
      { offset: '100%', color: '#6366f1', opacity: 0.7 },
    ],
  },
  users: {
    id: 'usersGradient',
    stops: [
      { offset: '0%', color: '#3b82f6', opacity: 0.9 },
      { offset: '100%', color: '#0ea5e9', opacity: 0.7 },
    ],
  },
  growth: {
    id: 'growthGradient',
    stops: [
      { offset: '0%', color: '#10b981', opacity: 0.9 },
      { offset: '100%', color: '#14b8a6', opacity: 0.7 },
    ],
  },
}

/**
 * Helper to create SVG gradient defs
 * @param {Object} gradients - Gradient configuration object
 * @returns {JSX.Element} SVG defs element
 */
export function createChartGradients(gradients = chartGradients) {
  return (
    <defs>
      {Object.values(gradients).map((gradient) => (
        <linearGradient key={gradient.id} id={gradient.id} x1="0" y1="0" x2="0" y2="1">
          {gradient.stops.map((stop, index) => (
            <stop
              key={index}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </linearGradient>
      ))}
    </defs>
  )
}
