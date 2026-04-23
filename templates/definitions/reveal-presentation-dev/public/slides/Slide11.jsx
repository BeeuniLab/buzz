// [DEMO SLIDE], REPLACE OR REMOVE
// TimelineSlide example - demonstrates timeline component
import { TimelineSlide } from '/slides-library.jsx'
import { Lightbulb, Code, Rocket, Trophy } from 'lucide-react'

export default function Slide11() {
  return (
    <TimelineSlide
      title="Development Journey"
      gradient="orange"
      items={[
        {
          title: 'Concept & Design',
          date: 'Q1 2024',
          description: 'Initial planning and design system development with focus on glass morphism aesthetics',
          icon: <Lightbulb className="w-8 h-8 text-white" />
        },
        {
          title: 'Core Development',
          date: 'Q2 2024',
          description: 'Built 13 slide templates and component library with runtime JSX compilation',
          icon: <Code className="w-8 h-8 text-white" />
        },
        {
          title: 'Launch & Testing',
          date: 'Q3 2024',
          description: 'Released beta version with Reveal.js integration and comprehensive documentation',
          icon: <Rocket className="w-8 h-8 text-white" />
        },
        {
          title: 'Production Ready',
          date: 'Q4 2024',
          description: 'Final optimizations, accessibility improvements, and full deployment to Cloudflare',
          icon: <Trophy className="w-8 h-8 text-white" />
        },
      ]}
    />
  )
}
