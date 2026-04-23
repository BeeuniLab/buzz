// [DEMO SLIDE], REPLACE OR REMOVE
// CallToActionSlide example - demonstrates CTA slide with button
import { Rocket } from 'lucide-react'
import { CallToActionSlide } from '/slides-library.jsx'
import { ICON_SIZES } from '/theme-config.js'

export default function Slide10() {
  return (
    <CallToActionSlide
      title="Start Building"
      subtitle="Create your next stunning presentation with glass morphism effects and sophisticated animations"
      buttonText="Get Started"
      buttonUrl="#"
      gradient="green"
      icon={<Rocket size={ICON_SIZES.hero} className="text-green-400" />}
    />
  )
}
