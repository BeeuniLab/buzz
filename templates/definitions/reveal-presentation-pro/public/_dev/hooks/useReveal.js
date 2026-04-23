import { useEffect, useRef, useState } from 'react';
import Reveal from 'reveal.js';

export function useReveal(revealRef, options = {}) {
    const deckRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    // Initialize Reveal
    useEffect(() => {
        if (!revealRef.current || deckRef.current) return;

        const deck = new Reveal(revealRef.current, {
            embedded: false,
            width: '100%',
            height: '100%',
            margin: 0,
            minScale: 0.2,
            maxScale: 2.0,
            ...options
        });

        deck.initialize().then(() => {
            deckRef.current = deck;
            setIsReady(true);
            console.log('[useReveal] Reveal initialized');
        });

        return () => {
            try {
                if (deckRef.current) {
                    deckRef.current.destroy();
                    deckRef.current = null;
                    setIsReady(false);
                }
            } catch (e) {
                console.warn('[useReveal] Cleanup error:', e);
            }
        };
    }, []); // Run once on mount

    // Update options dynamically
    useEffect(() => {
        if (deckRef.current && isReady) {
            deckRef.current.configure(options);
        }
    }, [options, isReady]);

    // Sync when content changes
    const sync = () => {
        if (deckRef.current && isReady) {
            // Reveal.js requires a slight delay or next tick sometimes to catch DOM updates
            // requestAnimationFrame is better than setTimeout(0)
            requestAnimationFrame(() => {
                try {
                    deckRef.current.sync();
                    deckRef.current.layout(); // Force layout update
                } catch (e) {
                    console.warn('[useReveal] Sync error:', e);
                }
            });
        }
    };

    return { deck: deckRef.current, isReady, sync };
}
