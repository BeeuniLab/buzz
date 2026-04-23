import React from 'react'
import { createRoot } from 'react-dom/client'
import { jsxImport } from '../compiler/index.js'
import { validateAndFixSlide } from '../utils/slideValidation.js'

export class PresentationLoader {
    constructor() {
        this.slides = []
        this.manifest = null
        this.Presentation = null
    }

    async loadManifest() {
        // Helper to load manifest from a path
        const fetchManifest = async (path) => {
            try {
                const response = await fetch(path, { cache: 'no-store' });
                if (response.ok) {
                    const data = await response.json();
                    return Array.isArray(data.slides) ? data : null;
                }
            } catch (error) {
                console.warn(`[PresentationLoader] Could not load ${path}:`, error.message);
            }
            return null;
        };

        // Load both possible manifest locations
        const [primaryManifest, fallbackManifest] = await Promise.all([
            fetchManifest('/slides/manifest.json'),
            fetchManifest('/manifest.json'),
        ]);

        // Merge and deduplicate slides from both manifests
        const allSlides = [
            ...(primaryManifest?.slides || []),
            ...(fallbackManifest?.slides || []),
        ];

        const uniqueSlides = [...new Set(allSlides)]
        const nonDemoSlides = uniqueSlides.filter((name) => !name.startsWith('demo-slide')); // Filter demo slides

        this.manifest = {
            slides: nonDemoSlides.length > 0 ? nonDemoSlides : uniqueSlides,
            metadata: primaryManifest?.metadata || fallbackManifest?.metadata || {},
        };

        console.log('[PresentationLoader] Manifest loaded:', this.manifest);
        return this.manifest;
    }

    async loadSlideJSON(filename) {
        try {
            const response = await fetch(`/slides/${filename}`, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const slideData = await response.json();

            // Use filename (without extension) as slide ID if not specified
            if (!slideData.id) {
                slideData.id = filename.replace(/\.(json|jsx|tsx)$/i, '');
            }

            const sanitized = validateAndFixSlide(slideData);

            console.log(`[PresentationLoader] Loaded slide: ${filename}`, sanitized);
            return sanitized;
        } catch (error) {
            console.error(`[PresentationLoader] Error loading ${filename}:`, error);
            throw error;
        }
    }

    async loadPresentation() {
        try {
            const presentationModule = await jsxImport('/_dev/Presentation.jsx')
            this.Presentation = presentationModule.default
        } catch (error) {
            console.error('[PresentationLoader] Failed to load Presentation component:', error)
            throw error
        }
    }

    async loadAllSlides() {
        await this.loadManifest()

        // STRICT MODE: Only load slides from manifest
        const slideFiles = this.manifest?.slides || []

        if (slideFiles.length === 0) {
            console.warn('[PresentationLoader] No slides found in manifest.json');
        }

        console.log(`[PresentationLoader] Loading ${slideFiles.length} slides from manifest:`, slideFiles)

        const slideData = []
        for (const file of slideFiles) {
            try {
                const data = await this.loadSlideJSON(file)
                slideData.push(data)
            } catch (error) {
                console.error(`[PresentationLoader] Skipping invalid slide ${file}:`, error)
            }
        }

        this.slides = slideData
        return slideData
    }
}
