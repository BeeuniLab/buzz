// [DEMO SLIDE], REPLACE OR REMOVE
// Fragment animations & Recharts example - demonstrates animations and data visualization
import { TwoColumnSlide } from '/slides-library.jsx'
import { Fragment } from '/slides-library.jsx'
import { GlassCard } from '/slides-library.jsx'
import { GradientBox } from '/slides-library.jsx'
import { Sparkles, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { chartTheme, createChartGradients } from '/lib/chartTheme.jsx'

export default function Slide09() {
  const data = [
    { month: 'Jan', revenue: 4200, users: 1200, growth: 3800 },
    { month: 'Feb', revenue: 5100, users: 1650, growth: 4500 },
    { month: 'Mar', revenue: 6800, users: 2100, growth: 5800 },
    { month: 'Apr', revenue: 8200, users: 2800, growth: 7200 },
    { month: 'May', revenue: 9500, users: 3400, growth: 8600 },
    { month: 'Jun', revenue: 11200, users: 4200, growth: 10100 },
  ]

  return (
    <TwoColumnSlide
      title="Animations & Data Visualization"
      gradient="blue"
      ratio="1:1"
      left={
        <div className="space-y-8">
          <Fragment type="fade-up" index={0}>
            <GlassCard>
              <h3 className="text-3xl font-bold mb-3">Fragment Animations</h3>
              <p className="text-xl text-white/80">Progressive reveal with Reveal.js</p>
            </GlassCard>
          </Fragment>

          <div className="flex justify-center gap-6">
            {[0, 1, 2].map((i) => (
              <Fragment key={i} type="zoom-in" index={i + 1}>
                <GradientBox gradient="blue" shape="circle" shadowType="lg" strong>
                  <Sparkles className="w-10 h-10 text-white" />
                </GradientBox>
              </Fragment>
            ))}
          </div>
        </div>
      }
      right={
        <GlassCard intensity="light">
          <div className="flex items-center gap-3 mb-6">
            <GradientBox gradient="blue" shape="rounded" strong>
              <TrendingUp className="w-6 h-6 text-white" />
            </GradientBox>
            <h3 className="text-3xl font-bold">Growth Metrics</h3>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
              {createChartGradients()}
              <CartesianGrid {...chartTheme.grid} />
              <XAxis dataKey="month" {...chartTheme.axis} />
              <YAxis {...chartTheme.axis} />
              <Tooltip {...chartTheme.tooltip} />
              <Legend {...chartTheme.legend} />
              <Bar dataKey="revenue" fill="url(#revenueGradient)" {...chartTheme.bar} name="Revenue" />
              <Bar dataKey="users" fill="url(#usersGradient)" {...chartTheme.bar} name="Users" />
              <Bar dataKey="growth" fill="url(#growthGradient)" {...chartTheme.bar} name="Growth" />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      }
    />
  )
}
