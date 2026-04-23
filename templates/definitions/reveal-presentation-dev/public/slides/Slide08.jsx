// [DEMO SLIDE], REPLACE OR REMOVE
// SectionSlide example - section divider with gradient backdrop
import { SectionSlide } from '/slides-library.jsx'
import { Zap } from 'lucide-react'

export default function Slide08() {
  return (
    <SectionSlide
      title="Advanced Features"
      subtitle="Exploring animations, data visualizations, and dynamic content capabilities"
      icon={<Zap size={64} className="text-pink-400" />}
      gradient="pink"
    />
  )
}
