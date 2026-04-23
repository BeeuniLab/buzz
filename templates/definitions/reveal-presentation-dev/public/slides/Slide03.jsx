// [DEMO SLIDE], REPLACE OR REMOVE
// ListSlide example - bullet points with icons and glass cards
import { ListSlide } from '/slides-library.jsx'

export default function Slide03() {
  return (
    <ListSlide
      title="Key Features"
      items={[
        { text: 'Beautiful Modern Design', subtext: 'Gradients, animations, and stunning visuals' },
        { text: 'Easy to Customize', subtext: 'Reusable components for quick modifications' },
        { text: 'Responsive & Accessible', subtext: 'Works perfectly on all devices' },
        { text: 'Runtime Compilation', subtext: 'No build step required for slides' },
      ]}
      icon="check"
      gradient="purple"
    />
  )
}
