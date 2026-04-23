// [DEMO SLIDE], REPLACE OR REMOVE
// StatsSlide example - grid of statistics with gradient colors
import { StatsSlide } from '/slides-library.jsx'

export default function Slide07() {
  return (
    <StatsSlide
      title="Powerful Features"
      gradient="amber"
      columns={3}
      stats={[
        { value: '13', label: 'Slide Types', subtext: 'Ready to use', color: 'from-blue-400 to-cyan-400' },
        { value: '12', label: 'Gradients', subtext: 'Stunning colors', color: 'from-purple-400 to-pink-400' },
        { value: '∞', label: 'Possibilities', subtext: 'Unlimited creativity', color: 'from-emerald-400 to-green-400' },
      ]}
    />
  )
}
