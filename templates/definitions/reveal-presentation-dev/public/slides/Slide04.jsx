// [DEMO SLIDE], REPLACE OR REMOVE
// TwoColumnSlide example - side-by-side content with custom components
import { Rocket, Target, Zap, Sparkles } from 'lucide-react'
import { TwoColumnSlide, GradientText } from '/slides-library.jsx'

const IconList = ({ items, colorClass }) => (
  <ul className="space-y-6 text-3xl">
    {items.map((item, i) => {
      const Icon = item.icon
      return (
        <li key={i} className="flex items-start gap-4">
          <Icon className={"w-8 h-8 mt-2 shrink-0 " + colorClass} />
          <span>{item.text}</span>
        </li>
      )
    })}
  </ul>
)

export default function Slide04() {
  const devItems = [
    { icon: Rocket, text: 'Lightning fast development' },
    { icon: Target, text: '13 pre-built slide templates' },
    { icon: Zap, text: 'Modern tech stack' },
  ]

  const presenterItems = [
    { icon: Sparkles, text: 'Professional slide templates' },
    { icon: Rocket, text: 'Dynamic content updates' },
    { icon: Target, text: 'Customizable themes' },
  ]

  return (
    <TwoColumnSlide
      title="Why Use This?"
      gradient="indigo"
      left={
        <div className="space-y-8">
          <h3 className="text-5xl font-bold mb-6">
            <GradientText gradient="blue">For Developers</GradientText>
          </h3>
          <IconList items={devItems} colorClass="text-blue-400" />
        </div>
      }
      right={
        <div className="space-y-8">
          <h3 className="text-5xl font-bold mb-6">
            <GradientText gradient="purple">For Presenters</GradientText>
          </h3>
          <IconList items={presenterItems} colorClass="text-purple-400" />
        </div>
      }
    />
  )
}
