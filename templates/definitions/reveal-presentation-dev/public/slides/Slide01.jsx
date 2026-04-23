// [DEMO SLIDE], REPLACE OR REMOVE
// TitleSlide example - showcases opening slide with icon and gradient backdrop
import { Sparkles } from 'lucide-react'
import { TitleSlide } from '/slides-library.jsx'
import { ICON_SIZES } from '/theme-config.js'

export default function Slide01() {
  return (
    <TitleSlide
      title="Beautiful Presentations"
      subtitle="Stunning glass morphism design with sophisticated animations and powerful visual effects"
      author="Your Name"
      date={new Date().getFullYear().toString()}
      gradient="violet"
      icon={<Sparkles size={ICON_SIZES.hero} className="text-violet-400" />}
    />
  )
}
