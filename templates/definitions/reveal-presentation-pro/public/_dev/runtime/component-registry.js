import React from 'react'
import { jsxImport } from '../compiler/index.js'

import {
    Sparkles, Check, Star, Zap, ChevronRight, Rocket, Target, Award,
    Users, TrendingUp, Shield, Trophy, Heart, Lightbulb, Code, Database,
    Globe, Lock, Mail, Phone, Settings, Upload, Download, Search,
    Calendar, Clock, BarChart2, BarChart3, Activity, AlertCircle,
    Quote, TestTube, ArrowRight, Layout, Palette, Cpu
} from 'lucide-react'

import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts'

// Import ALL exports from slides-library so any new component is automatically available
import * as SlideLibrary from '../../../slides-library.jsx'

export { React }

const LIBRARY_REGISTRY = {
    'd3': { version: '7.8.5', provider: 'esm' },
    'chart.js': { version: '4.4.0', provider: 'esm' },
    'plotly.js': { version: '2.27.0', provider: 'jsdelivr' },
    'lodash': { version: '4.17.21', provider: 'esm' },
    'dayjs': { version: '1.11.10', provider: 'esm' },
    'axios': { version: '1.6.2', provider: 'esm' },
    'gsap': { version: '3.12.4', provider: 'jsdelivr' },
    'animejs': { version: '3.2.2', provider: 'jsdelivr' },
    'three': { version: '0.160.0', provider: 'esm' },
    'mathjs': { version: '12.3.0', provider: 'esm' },
    'numeral': { version: '2.0.6', provider: 'esm' }
}

class LibraryLoader {
    constructor() {
        this.loadedLibraries = new Map()
        this.pendingLoads = new Map()
        this.cdnProviders = {
            esm: (name, version) => `https://esm.sh/${name}${version ? `@${version}` : ''}`,
            unpkg: (name, version) => `https://unpkg.com/${name}${version ? `@${version}` : ''}/dist/index.min.js`,
            jsdelivr: (name, version) => `https://cdn.jsdelivr.net/npm/${name}${version ? `@${version}` : ''}/+esm`
        }
    }

    async load(libraryName, version = 'latest', provider = 'esm') {
        const cacheKey = `${libraryName}@${version}`

        if (this.loadedLibraries.has(cacheKey)) {
            return this.loadedLibraries.get(cacheKey)
        }

        if (this.pendingLoads.has(cacheKey)) {
            return this.pendingLoads.get(cacheKey)
        }

        const loadPromise = this._loadFromCDN(libraryName, version, provider)
        this.pendingLoads.set(cacheKey, loadPromise)

        try {
            const library = await loadPromise
            this.loadedLibraries.set(cacheKey, library)
            return library
        } finally {
            this.pendingLoads.delete(cacheKey)
        }
    }

    async _loadFromCDN(name, version, provider) {
        const url = this.cdnProviders[provider](name, version)
        const globalName = `__lib_${name.replace(/[^a-zA-Z0-9]/g, '_')}`

        return new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.type = 'module'
            script.textContent = `
        import * as lib from '${url}';
        window.${globalName} = lib;
        window.dispatchEvent(new CustomEvent('library-loaded', { detail: '${globalName}' }));
      `

            const handleLoad = (event) => {
                if (event.detail === globalName) {
                    window.removeEventListener('library-loaded', handleLoad)
                    const lib = window[globalName]
                    if (lib) {
                        resolve(lib)
                    } else {
                        reject(new Error(`Library ${name} loaded but not found in window`))
                    }
                }
            }

            window.addEventListener('library-loaded', handleLoad)

            script.onerror = () => {
                window.removeEventListener('library-loaded', handleLoad)
                reject(new Error(`Failed to load ${name} from ${url}`))
            }

            document.head.appendChild(script)

            setTimeout(() => {
                window.removeEventListener('library-loaded', handleLoad)
                reject(new Error(`Timeout loading ${name}`))
            }, 30000)
        })
    }
}

const libraryLoader = new LibraryLoader()

export const loadLibrary = async (name, version, provider) => {
    const config = LIBRARY_REGISTRY[name]
    if (config && !version && !provider) {
        return libraryLoader.load(name, config.version, config.provider)
    }
    return libraryLoader.load(name, version, provider)
}

export async function setupGlobals() {
    if (typeof window === 'undefined') return

    const library = await jsxImport('/slides-library.jsx')

    const {
        cn, GRADIENT_CLASSES, MESH_GRADIENTS, PARTICLE_CONFIGS,
        TitleSlide, ContentSlide, SectionSlide, ListSlide, StatsSlide,
        TimelineSlide, TwoColumnSlide, CodeSlide, ComparisonSlide,
        QuoteSlide, ImageSlide, FullImageSlide, CallToActionSlide,
        GlassCard, SlideContainer, SlideTitle, IconBadge,
        GradientBackdrop, GradientBox, GradientText, Fragment, Divider
    } = library

    window.React = React

    // Register Recharts components
    window.Recharts = {
        BarChart, Bar, LineChart, Line, AreaChart, Area,
        PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
        XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
    }

    // Register Slide Templates & Components
    window.SlideTemplates = {
        TitleSlide, ContentSlide, SectionSlide, ListSlide, StatsSlide,
        TimelineSlide, TwoColumnSlide, CodeSlide, ComparisonSlide,
        QuoteSlide, ImageSlide, FullImageSlide, CallToActionSlide,
        GlassCard, SlideContainer, SlideTitle, IconBadge,
        GradientBackdrop, GradientBox, GradientText, Fragment, Divider,
        // Automatically include ALL exports from slides-library.jsx
        // This allows LLMs to create new components without manual registration
        ...SlideLibrary
    }

    // Register Lucide Icons
    window.LucideReact = {
        Sparkles, Check, Star, Zap, ChevronRight, Rocket, Target, Award,
        Users, TrendingUp, Shield, Trophy, Heart, Lightbulb, Code, Database,
        Globe, Lock, Mail, Phone, Settings, Upload, Download, Search,
        Calendar, Clock, BarChart2, BarChart3, Activity, AlertCircle,
        Quote, TestTube, ArrowRight, Layout, Palette, Cpu
    }

    window.SlideUtils = {
        cn,
        GRADIENT_CLASSES,
        loadLibrary
    }

    console.log('Component registry initialized with', Object.keys(window.SlideTemplates).length, 'components')
}
