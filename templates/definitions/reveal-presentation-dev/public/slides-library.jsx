import { Check, ChevronRight, Star, Zap, Quote } from 'lucide-react'
import {
  THEME,
  cn,
  gradient,
  text,
  gap,
  margin,
  radius,
  gridCols,
  gridRatio,
  iconSize,
  shadow,
  GRADIENT_CLASSES,
  GRADIENT_CLASSES_STRONG,
  GRID_COLUMNS,
  GRID_RATIOS,
  ICON_SIZE_CLASSES,
  ICON_SIZES,
} from '/theme-config.js'

// ==================== EXPORTS ====================

export {
  cn,
  gradient,
  GRADIENT_CLASSES,
  GRADIENT_CLASSES_STRONG,
  GRID_COLUMNS,
  GRID_RATIOS,
  ICON_SIZE_CLASSES,
  ICON_SIZES,
}

// ==================== UI COMPONENTS ====================

export function Divider({ width = 'w-20', className }) {
  return <div className={cn('gradient-divider', width, className)} />
}

export function Fragment({ children, index, type = 'fade-in', className }) {
  return (
    <div className={cn('fragment', type, className)} data-fragment-index={index}>
      {children}
    </div>
  )
}

export function GradientText({ children, gradient: gradientName = 'blue', strong = false, className = '' }) {
  return (
    <span className={cn('bg-gradient-to-r', gradient(gradientName, strong), 'bg-clip-text text-transparent', className)}>
      {children}
    </span>
  )
}

export function GradientBackdrop({ gradient: gradientName, intensity = 'subtle' }) {
  return (
    <>
      <div className={cn('absolute inset-0 bg-gradient-to-br', gradient(gradientName, true), THEME.backdropIntensity[intensity])} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
    </>
  )
}

export function GlassCard({ children, className, intensity = 'light', hover = false, size = 'md' }) {
  const sizeClasses = {
    sm: 'p-6',
    md: 'p-10',
    lg: 'p-14',
  }

  return (
    <div
      className={cn(
        THEME.glass.intensity[intensity],
        'rounded-2xl',
        sizeClasses[size],
        hover && 'hover-lift transition-all duration-300',
        className
      )}
    >
      {children}
    </div>
  )
}

export function IconBadge({ children, size = 'lg', gradient: gradientName, className }) {
  return (
    <div className={cn('animate-float', className)}>
      <div
        className={cn(
          'icon-badge',
          THEME.padding.badge[size],
          gradientName && `bg-gradient-to-br ${gradient(gradientName, true)}`
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function SlideContainer({ children, variant = 'content', align = 'left', background = 'default', className, ...props }) {
  const containerClasses = {
    content: cn(
      'flex flex-col h-full',
      THEME.padding.section.x,
      THEME.padding.section.y,
      gap('xl')
    ),
    centered: cn(
      'relative z-10 flex flex-col items-center justify-center h-full text-center',
      THEME.padding.section.centerX
    ),
    minimal: 'h-full',
  }

  const alignmentClasses = align === 'center' ? 'items-center text-center' : ''

  return (
    <section className={cn('relative', THEME.colors.bg[background], className)} {...props}>
      <div className={cn(containerClasses[variant], variant === 'content' && alignmentClasses)}>
        {children}
      </div>
    </section>
  )
}

export function SlideTitle({ children, gradient: gradientName = 'blue', level = 'h2', className }) {
  const Component = level
  return (
    <Component className={cn('slide-title', className)}>
      <GradientText gradient={gradientName}>{children}</GradientText>
    </Component>
  )
}

export function GradientBox({ children, gradient: gradientName, shape = 'rounded', strong = false, shadowType = 'md', size = 'md', className }) {
  const shapeClasses = {
    rounded: 'rounded-lg',
    circle: 'rounded-full',
  }

  const sizeClasses = {
    sm: 'w-12 h-12 p-3',
    md: 'w-16 h-16 p-4',
    lg: 'w-20 h-20 p-5',
    xl: 'w-24 h-24 p-6',
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br',
        sizeClasses[size],
        gradient(gradientName, strong),
        shapeClasses[shape],
        shadow(shadowType),
        className
      )}
    >
      {children}
    </div>
  )
}

// ==================== SLIDE COMPONENTS ====================

/**
 * TitleSlide - Opening slide with gradient backdrop and icon
 * @param {string} title - Main heading text (required)
 * @param {string} [subtitle] - Optional subtitle text
 * @param {string} [author] - Optional author name
 * @param {string} [date] - Optional date
 * @param {string} [gradient='purple'] - Gradient name: purple, blue, green, orange, pink, red, indigo, teal, amber, rose, violet, emerald
 * @param {ReactNode} [icon] - Optional icon element from lucide-react
 * @example
 * <TitleSlide
 *   title="My Presentation"
 *   subtitle="A beautiful slide deck"
 *   gradient="violet"
 *   icon={<Sparkles size={ICON_SIZES.hero} />}
 * />
 */
export function TitleSlide({ title, subtitle, author, date, gradient: gradientName = 'purple', icon }) {
  return (
    <SlideContainer variant="centered" className="overflow-hidden" data-transition="slide">
      <GradientBackdrop gradient={gradientName} intensity="subtle" />

      {icon && (
        <IconBadge size="md" className={margin('xl')} aria-hidden="true">
          {icon}
        </IconBadge>
      )}

      <h1
        className={cn(
          text('hero', 'black', 'tight'),
          margin('md'),
          'animate-slide-up text-shadow-glow-white-lg drop-shadow-glow-md'
        )}
        role="heading"
        aria-level="1"
      >
        {title}
      </h1>

      {subtitle && (
        <GlassCard className={cn(margin('xl'), 'max-w-5xl')}>
          <p className={cn('slide-subtitle', THEME.lineHeight.relaxed)}>{subtitle}</p>
        </GlassCard>
      )}

      {(author || date) && (
        <div
          className={cn(
            'flex',
            gap('md'),
            text('body'),
            THEME.colors.text.secondary,
            'animate-fade-in-delay glass-inline'
          )}
        >
          {author && <span className={THEME.fontWeight.medium}>{author}</span>}
          {author && date && <span className="text-gray-500">•</span>}
          {date && <span>{date}</span>}
        </div>
      )}
    </SlideContainer>
  )
}

/**
 * ContentSlide - Simple content layout with title
 * @param {string} title - Slide title
 * @param {ReactNode} children - Slide content
 * @param {string} [align='left'] - Content alignment: 'left' or 'center'
 * @param {string} [background='default'] - Background style: 'default', 'gradient', 'subtle'
 * @param {string} [gradient='blue'] - Gradient color for title
 */
export function ContentSlide({ title, children, align = 'left', background = 'default', gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="content" align={align} background={background}>
      <SlideTitle gradient={gradientName}>{title}</SlideTitle>

      <div className={cn('flex-1 flex', align === 'center' && 'justify-center', 'animate-fade-in-delay')}>
        <div className={cn(text('h4'), THEME.colors.text.primary, THEME.lineHeight.relaxed, 'max-w-5xl')}>
          {children}
        </div>
      </div>
    </SlideContainer>
  )
}

export function SectionSlide({ title, subtitle, icon, gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="centered" className="overflow-hidden">
      <GradientBackdrop gradient={gradientName} intensity="medium" />

      {icon && (
        <IconBadge gradient={gradientName} className={margin('xl')}>
          {icon}
        </IconBadge>
      )}

      <h2 className={cn(text('display', 'black'), margin('md'), 'animate-slide-up text-shadow-glow-blue-md')}>
        <GradientText gradient={gradientName} strong>
          {title}
        </GradientText>
      </h2>

      {subtitle && (
        <GlassCard className="max-w-4xl">
          <p className="slide-subtitle">{subtitle}</p>
        </GlassCard>
      )}
    </SlideContainer>
  )
}

const iconComponents = {
  check: Check,
  chevron: ChevronRight,
  star: Star,
  zap: Zap,
}

/**
 * ListSlide - Bullet points with icons in glass cards
 * @param {string} title - Slide title
 * @param {Array<{text: string, subtext?: string}>} items - List items with optional subtext
 * @param {string} [icon='chevron'] - Icon type: 'check', 'chevron', 'star', 'zap'
 * @param {number} [columns=1] - Number of columns: 1 or 2
 * @param {string} [gradient='blue'] - Gradient color
 * @example
 * <ListSlide
 *   title="Features"
 *   items={[
 *     { text: 'Fast', subtext: 'Lightning quick' },
 *     { text: 'Beautiful', subtext: 'Stunning design' }
 *   ]}
 *   icon="check"
 *   gradient="purple"
 * />
 */
export function ListSlide({ title, items, icon = 'chevron', columns = 1, gradient: gradientName = 'blue' }) {
  const Icon = iconComponents[icon]

  const renderItem = (item, index) => (
    <Fragment key={index} type="fade-in-then-semi-out" index={index}>
      <li className={cn('flex', gap('md'), 'items-start group glass', radius('lg'), 'px-6 py-5 hover-lift')}>
        <GradientBox gradient={gradientName} size="sm" shadowType="sm" className="group-hover:scale-110" aria-hidden="true">
          <Icon className={cn(iconSize('small'), 'text-white')} />
        </GradientBox>
        <div className="flex-1 min-w-0">
          <p className="slide-heading leading-snug">{item.text}</p>
          {item.subtext && <p className="slide-caption mt-1.5">{item.subtext}</p>}
        </div>
      </li>
    </Fragment>
  )

  return (
    <SlideContainer variant="content">
      <SlideTitle gradient={gradientName}>{title}</SlideTitle>

      {columns === 2 ? (
        <div className={cn('grid', gridCols(2), gap('lg'))} role="list">
          {[items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].map(
            (columnItems, colIndex) => (
              <ul key={colIndex} className={gap('md')} role="presentation">
                {columnItems.map((item, index) => renderItem(item, colIndex * Math.ceil(items.length / 2) + index))}
              </ul>
            )
          )}
        </div>
      ) : (
        <ul className={cn('flex flex-col', gap('md'))} role="list">
          {items.map((item, index) => renderItem(item, index))}
        </ul>
      )}
    </SlideContainer>
  )
}

/**
 * StatsSlide - Grid of statistics with gradient styling
 * @param {string} [title] - Optional slide title
 * @param {Array<{value: string, label: string, subtext?: string, color?: string}>} stats - Statistics to display
 * @param {number} [columns=3] - Number of columns: 2, 3, or 4
 * @param {string} [gradient='blue'] - Gradient color for values without custom color
 */
export function StatsSlide({ title, stats, columns = 3, gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="content">
      {title && <SlideTitle gradient={gradientName} className={margin('xl')}>{title}</SlideTitle>}

      <div className={cn('grid', gridCols(columns), gap('lg'), 'flex-1 items-center')}>
        {stats.map((stat, index) => (
          <Fragment key={index} type="zoom-in" index={index}>
            <GlassCard hover className="flex flex-col items-center text-center group">
              {stat.color ? (
                <div
                  className={cn(
                    'slide-stat text-shadow-glow-blue-sm bg-gradient-to-r',
                    stat.color,
                    'bg-clip-text text-transparent group-hover:scale-105 transition-transform'
                  )}
                >
                  {stat.value}
                </div>
              ) : (
                <div className="slide-stat text-shadow-glow-blue-sm group-hover:scale-105 transition-transform">
                  <GradientText gradient={gradientName}>{stat.value}</GradientText>
                </div>
              )}
              <Divider className={margin('sm')} />
              <div className={cn('slide-heading', margin('xs'))}>{stat.label}</div>
              {stat.subtext && <div className="slide-caption">{stat.subtext}</div>}
            </GlassCard>
          </Fragment>
        ))}
      </div>
    </SlideContainer>
  )
}

/**
 * TimelineSlide - Vertical timeline with events
 * @param {string} title - Slide title
 * @param {Array<{title: string, description: string, date?: string, icon?: ReactNode}>} items - Timeline events
 * @param {string} [gradient='blue'] - Gradient color
 * @example
 * <TimelineSlide
 *   title="Our Journey"
 *   gradient="orange"
 *   items={[
 *     {
 *       title: 'Launch',
 *       date: 'Q1 2024',
 *       description: 'Initial release',
 *       icon: <Rocket className="w-8 h-8 text-white" />
 *     }
 *   ]}
 * />
 */
export function TimelineSlide({ title, items, gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="content">
      <SlideTitle gradient={gradientName}>{title}</SlideTitle>

      <div className="flex-1 flex items-center">
        <div className="relative w-full">
          <Fragment type="fade-in" index={0}>
            <div className="absolute left-12 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-gray-700 to-transparent" />
          </Fragment>

          <div className={cn('flex flex-col', gap('lg'))}>
            {items.map((item, index) => (
              <Fragment key={index} type="fade-left" index={index + 1}>
                <div className={cn('relative flex', gap('lg'), 'items-start')}>
                  <GradientBox gradient={gradientName} size="xl" shape="circle" shadowType="lg" className="relative z-10">
                    {item.icon || <div className={cn(text('h4', 'bold'), 'text-white')}>{index + 1}</div>}
                  </GradientBox>

                  <div className={cn('flex-1 glass', radius('xl'), 'p-6 hover-lift')}>
                    <div className={cn('flex items-start justify-between', margin('xs'))}>
                      <h3 className={cn('slide-heading', THEME.fontWeight.bold)}>{item.title}</h3>
                      {item.date && (
                        <span className={cn(text('body'), THEME.fontWeight.semibold)}>
                          <GradientText gradient={gradientName}>{item.date}</GradientText>
                        </span>
                      )}
                    </div>
                    <p className="slide-body">{item.description}</p>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </SlideContainer>
  )
}

/**
 * TwoColumnSlide - Side-by-side content layout
 * @param {string} [title] - Optional slide title
 * @param {ReactNode} left - Left column content
 * @param {ReactNode} right - Right column content
 * @param {string} [ratio='1:1'] - Column ratio: '1:1', '1:2', or '2:1'
 * @param {string} [gradient='purple'] - Gradient color for title
 */
export function TwoColumnSlide({ title, left, right, ratio = '1:1', gradient: gradientName = 'purple' }) {
  return (
    <SlideContainer variant="content">
      {title && <SlideTitle gradient={gradientName}>{title}</SlideTitle>}

      <div className={cn('grid', gridRatio(ratio), gap('lg'), 'flex-1 items-stretch')}>
        <Fragment type="fade-right" index={0}>
          <GlassCard hover className="flex flex-col justify-center h-full">
            <div className="slide-content">{left}</div>
          </GlassCard>
        </Fragment>
        <Fragment type="fade-left" index={1}>
          <GlassCard hover className="flex flex-col justify-center h-full">
            <div className="slide-content">{right}</div>
          </GlassCard>
        </Fragment>
      </div>
    </SlideContainer>
  )
}

export function CodeSlide({ title, code, language = 'typescript', highlight, gradient: gradientName = 'green' }) {
  return (
    <SlideContainer variant="content">
      {title && <SlideTitle gradient={gradientName} className={margin('xl')}>{title}</SlideTitle>}

      <Fragment type="fade-up" index={0}>
        <div className="flex-1 flex items-center min-h-0">
          <GlassCard hover size="lg" className="w-full max-h-[600px] overflow-hidden flex flex-col">
            <pre className="overflow-auto flex-1 m-0">
              <code
                className={cn(
                  `language-${language}`,
                  'text-lg',
                  'font-mono',
                  THEME.lineHeight.relaxed,
                  THEME.colors.text.primary
                )}
                data-line-numbers={highlight}
              >
                {code}
              </code>
            </pre>
          </GlassCard>
        </div>
      </Fragment>
    </SlideContainer>
  )
}

export function ComparisonSlide({
  title,
  leftTitle,
  rightTitle,
  items,
  leftGradient = 'blue',
  rightGradient = 'purple',
}) {
  return (
    <SlideContainer variant="content">
      {title && (
        <h2 className={cn(text('display', 'bold'), margin('xl'), 'text-center animate-slide-up')}>
          <GradientText>{title}</GradientText>
        </h2>
      )}

      <GlassCard className="flex-1 overflow-auto p-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-white/15">
              <th className="text-left py-5 px-6 w-1/3"></th>
              <th className={cn('text-center py-5 px-6 w-1/3', text('h3', 'bold'))}>
                <span className={cn('bg-gradient-to-r', gradient(leftGradient), 'bg-clip-text text-transparent')}>
                  {leftTitle}
                </span>
              </th>
              <th className={cn('text-center py-5 px-6 w-1/3', text('h3', 'bold'))}>
                <span className={cn('bg-gradient-to-r', gradient(rightGradient), 'bg-clip-text text-transparent')}>
                  {rightTitle}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-white/8 hover:bg-white/5 transition-all">
                <td className="py-5 px-6 slide-heading">{item.label}</td>
                <td className="py-5 px-6 slide-caption text-center">{item.left}</td>
                <td className="py-5 px-6 slide-caption text-center">{item.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </SlideContainer>
  )
}

export function QuoteSlide({ quote, author, role, gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="centered" className="overflow-hidden">
      <GlassCard hover className="max-w-6xl relative">
        <div
          className={cn(
            'absolute -top-8 -left-8 w-20 h-20 bg-gradient-to-br',
            gradient(gradientName),
            'opacity-25 animate-float',
            radius('full'),
            'flex items-center justify-center'
          )}
        >
          <Quote className={cn(iconSize('large'), 'text-white')} />
        </div>

        <p
          className={cn(
            text('h2'),
            THEME.fontWeight.normal,
            THEME.lineHeight.relaxed,
            margin('xl'),
            THEME.colors.text.primary
          )}
        >
          <GradientText gradient={gradientName}>{quote}</GradientText>
        </p>

        {(author || role) && (
          <div className="flex flex-col items-end">
            <Divider width="w-28" className={margin('sm')} />
            {author && <p className={cn('slide-heading text-gray-200', margin('xs'))}>{author}</p>}
            {role && <p className="slide-caption">{role}</p>}
          </div>
        )}
      </GlassCard>
    </SlideContainer>
  )
}

export function ImageSlide({ src, alt, title, caption, fit = 'contain', overlay = false, gradient: gradientName = 'blue' }) {
  return (
    <section className="relative">
      <div className="absolute-center p-20 animate-scale-in">
        <img
          src={src}
          alt={alt}
          className={cn(
            'max-h-full max-w-full',
            radius('xl'),
            'shadow-elevation-xl',
            fit === 'cover' && 'object-cover w-full h-full',
            fit === 'contain' && 'object-contain'
          )}
        />
      </div>

      {(title || caption) && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 p-20',
            overlay && 'bg-gradient-to-t from-black/80 via-black/50 to-transparent'
          )}
        >
          <GlassCard className="max-w-4xl mx-auto">
            {title && (
              <h2 className={cn(text('h2', 'bold'), margin('xs'))}>
                <GradientText gradient={gradientName}>{title}</GradientText>
              </h2>
            )}
            {caption && <div className="slide-caption text-gray-200">{caption}</div>}
          </GlassCard>
        </div>
      )}
    </section>
  )
}

export function FullImageSlide({ src, alt, title, subtitle, overlay = 'dark', position = 'center', gradient: gradientName = 'blue' }) {
  return (
    <section
      className="relative"
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {(title || subtitle) && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-center px-20 text-center',
            THEME.position[position],
            THEME.overlay[overlay]
          )}
        >
          <GlassCard hover className="max-w-6xl">
            {title && (
              <h2 className={cn(text('display', 'black'), margin('md'), 'text-shadow-glow-blue-md')}>
                <GradientText gradient={gradientName} strong>
                  {title}
                </GradientText>
              </h2>
            )}
            {subtitle && <p className="slide-subtitle max-w-4xl mx-auto">{subtitle}</p>}
          </GlassCard>
        </div>
      )}
    </section>
  )
}

/**
 * CallToActionSlide - CTA slide with gradient backdrop and button
 * @param {string} title - Main heading
 * @param {string} [subtitle] - Optional subtitle
 * @param {string} buttonText - Button text
 * @param {string} [buttonUrl] - Button link (defaults to #)
 * @param {ReactNode} [icon] - Optional icon element
 * @param {string} [gradient='blue'] - Gradient color
 */
export function CallToActionSlide({ title, subtitle, buttonText, buttonUrl, icon, gradient: gradientName = 'blue' }) {
  return (
    <SlideContainer variant="centered" className="overflow-hidden">
      <GradientBackdrop gradient={gradientName} intensity="subtle" />

      {icon && (
        <IconBadge gradient={gradientName} className={margin('xl')}>
          {icon}
        </IconBadge>
      )}

      <h2 className={cn(text('display', 'black'), margin('md'), 'animate-slide-up text-shadow-glow-white-md drop-shadow-glow-sm')}>
        {title}
      </h2>

      {subtitle && (
        <GlassCard className={cn(margin('2xl'), 'max-w-5xl')}>
          <p className={cn('slide-subtitle', THEME.lineHeight.relaxed)}>{subtitle}</p>
        </GlassCard>
      )}

      <a
        href={buttonUrl || '#'}
        className={cn(
          'inline-block px-16 py-7',
          text('h3', 'bold'),
          'text-white bg-gradient-to-r',
          gradient(gradientName),
          radius('xl'),
          'shadow-elevation-lg hover-glow animate-scale-in animate-pulse-glow animate-delay-500'
        )}
      >
        {buttonText}
      </a>
    </SlideContainer>
  )
}
