import React, { useState, useEffect } from 'react';
import { PresentationLoader } from './runtime/loader.js';
import { setupGlobals } from './runtime/component-registry.js';

export default function App() {
    const [status, setStatus] = useState('initializing'); // initializing, loading, ready, error
    const [error, setError] = useState(null);
    const [data, setData] = useState({ slides: [], manifest: null, PresentationComponent: null });

    useEffect(() => {
        async function init() {
            try {
                // 1. Setup Globals (Component Registry)
                await setupGlobals();

                // 2. Load Presentation Component
                const loader = new PresentationLoader();
                await loader.loadPresentation();
                const PresentationComponent = loader.Presentation;

                setStatus('loading');

                // 3. Load Slides
                const slides = await loader.loadAllSlides();
                const manifest = loader.manifest;

                setData({ slides, manifest, PresentationComponent });
                setStatus('ready');
            } catch (err) {
                console.error('Bootstrap error:', err);
                setError(err);
                setStatus('error');
            }
        }

        init();
    }, []);

    if (status === 'initializing' || status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
                    <p className="text-2xl text-gray-300">
                        {status === 'initializing' ? 'Initializing runtime...' : 'Loading presentation...'}
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-8">
                <div className="max-w-2xl">
                    <h1 className="text-4xl font-bold text-red-400 mb-4">Failed to Load Presentation</h1>
                    <pre className="text-lg text-gray-300 whitespace-pre-wrap bg-gray-800 p-4 rounded">
                        {error?.message || 'Unknown error'}
                    </pre>
                    <p className="mt-4 text-gray-400">Check the browser console for more details.</p>
                </div>
            </div>
        );
    }

    if (status === 'ready' && data.PresentationComponent) {
        const { PresentationComponent, slides, manifest } = data;
        return (
            <PresentationComponent
                slides={slides}
                manifest={manifest}
                theme={manifest?.metadata?.theme || 'dark'}
                transition={manifest?.metadata?.transition || 'slide'}
                controls={true}
                progress={true}
            />
        );
    }

    return null;
}
