import React from 'react'

export function cn(...classes) {
    return classes.filter(Boolean).join(' ')
}

/* Tailwind gradient classes for bg-gradient-to-r/br/etc */
export const GRADIENT_CLASSES = {
    purple: 'from-purple-500 to-purple-700',
    blue: 'from-blue-500 to-cyan-500',
    emerald: 'from-emerald-500 to-green-600',
    violet: 'from-violet-500 to-purple-600',
    cyan: 'from-cyan-500 to-blue-500',
    pink: 'from-pink-500 to-rose-500',
    orange: 'from-orange-500 to-red-500',
    teal: 'from-teal-500 to-cyan-600',
}

/* Mesh gradient color presets for backgrounds */
export const MESH_GRADIENTS = {
    violet: ['#7c3aed', '#6366f1', '#a855f7'],
    purple: ['#8b5cf6', '#a855f7', '#c084fc'],
    blue: ['#3b82f6', '#6366f1', '#60a5fa'],
    cyan: ['#06b6d4', '#0ea5e9', '#22d3ee'],
    emerald: ['#10b981', '#14b8a6', '#34d399'],
    pink: ['#ec4899', '#f472b6', '#fb7185'],
    orange: ['#f97316', '#fb923c', '#fdba74'],
    purplePink: ['#8b5cf6', '#ec4899', '#a855f7'],
    blueGreen: ['#0ea5e9', '#14b8a6', '#22d3ee'],
}

/* Particle background configuration presets */
export const PARTICLE_CONFIGS = {
    subtle: { count: 20, speed: 'slow' },
    medium: { count: 30, speed: 'medium' },
    dense: { count: 50, speed: 'medium' },
    energetic: { count: 40, speed: 'fast' },
}

export function Fragment({ children, index = 0, type = 'fade-in' }) {
    return (
        <div className={`fragment ${type}`} data-fragment-index={index}>
            {children}
        </div>
    )
}

export function IconBadge({ icon, color = 'purple', size = 'md', className }) {
    const Icon = window.LucideReact?.[icon] || window.LucideReact?.Sparkles
    const sizes = { sm: 'p-2', md: 'p-3', lg: 'p-4' }
    const iconSizes = { sm: 16, md: 24, lg: 32 }

    return (
        <div className={`rounded-xl bg-${color}-500/10 text-${color}-400 ${sizes[size]} ${className || ''}`}>
            <Icon size={iconSizes[size]} />
        </div>
    )
}

export function StatCard({ title, value, trend, icon, className, ...props }) {
    return (
        <div className={`bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-2xl p-6 ${className || ''}`} {...props}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
                    <h3 className="text-3xl font-bold text-white">{value}</h3>
                </div>
                {icon && <IconBadge icon={icon} size="md" />}
            </div>
            {trend && (
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trend}
                    </span>
                    <span className="text-slate-500 text-sm">vs last month</span>
                </div>
            )}
        </div>
    )
}

export function GlassCard({ children, className, ...props }) {
    return (
        <div className={`bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 ${className || ''}`} {...props}>
            {children}
        </div>
    )
}

export function Timeline({ items, className }) {
    return (
        <div className={`space-y-8 ${className || ''}`}>
            {items.map((item, i) => (
                <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-purple-500 ring-4 ring-purple-500/20" />
                        {i !== items.length - 1 && <div className="w-0.5 h-full bg-slate-700/50 my-2" />}
                    </div>
                    <div className="pb-8">
                        <span className="text-sm text-purple-400 font-mono mb-1 block">{item.date}</span>
                        <h4 className="text-lg font-semibold text-white mb-2">{item.title}</h4>
                        <p className="text-slate-400 leading-relaxed">{item.description}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

export function Comparison({ items, className }) {
    return (
        <div className={`grid grid-cols-2 gap-8 ${className || ''}`}>
            {items.map((item, i) => (
                <div key={i} className="bg-slate-800/50 rounded-2xl p-6 border border-white/5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`w-2 h-8 rounded-full ${i === 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <h3 className="text-xl font-bold text-white">{item.title}</h3>
                    </div>
                    <ul className="space-y-3">
                        {item.points.map((point, j) => (
                            <li key={j} className="flex items-start gap-3 text-slate-300">
                                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-rose-500/50' : 'bg-emerald-500/50'}`} />
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}

export function CodeBlock({ code, language = 'javascript', filename, className }) {
    // Note: Prism should be available globally or we can use simple pre/code
    // For now, simple rendering with class for Prism to pick up if running
    return (
        <div className={`rounded-xl overflow-hidden bg-[#1e1e1e] border border-white/10 ${className || ''}`}>
            {filename && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/5">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                        <div className="w-3 h-3 rounded-full bg-green-500/20" />
                    </div>
                    <span className="text-xs text-slate-500 font-mono ml-2">{filename}</span>
                </div>
            )}
            <pre className={`p-4 overflow-x-auto text-sm font-mono language-${language}`}>
                <code>{code}</code>
            </pre>
        </div>
    )
}

