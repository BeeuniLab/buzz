// [DEMO SLIDE], REPLACE OR REMOVE
// ContentSlide example - simple content layout with centered text
import { ContentSlide, GradientText } from '/slides-library.jsx'

export default function Slide02() {
  return (
    <ContentSlide title="Welcome" align="center" gradient="emerald">
      <p className="text-5xl leading-relaxed max-w-4xl">
        Create stunning, modern presentations with glass morphism effects, sophisticated gradients, and smooth animations. This template combines the power of{' '}
        <GradientText gradient="emerald" className="font-semibold">Reveal.js</GradientText> with beautiful React components and cutting-edge design.
      </p>
    </ContentSlide>
  )
}
