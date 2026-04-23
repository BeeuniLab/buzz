// [DEMO SLIDE], REPLACE OR REMOVE
// CodeSlide example - displays code with syntax highlighting
import { CodeSlide } from '/slides-library.jsx'

export default function Slide06() {
  return (
    <CodeSlide
      title="Easy to Use"
      language="typescript"
      gradient="teal"
      code={`import { TitleSlide, ContentSlide } from '/slides-library.jsx'
import { Sparkles } from 'lucide-react'

// Create Slide01.jsx
export default function Slide01() {
  return (
    <TitleSlide
      title="My Amazing Talk"
      subtitle="Built in minutes, not hours"
      gradient="violet"
      icon={<Sparkles size={80} className="text-violet-400" />}
    />
  )
}

// Create Slide02.jsx
export default function Slide02() {
  return (
    <ContentSlide title="Hello World" gradient="emerald">
      <p>Your content goes here!</p>
    </ContentSlide>
  )
}`}
    />
  )
}
