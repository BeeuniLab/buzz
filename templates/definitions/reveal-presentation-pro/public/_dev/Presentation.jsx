import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Reveal from 'reveal.js';
import { SlideRenderer } from './renderer/SlideRenderer.jsx';
import { EditorOverlay } from './renderer/EditorOverlay.jsx';
import { validateAndFixSlide } from './utils/slideValidation.js';
import { StreamingBuffer } from './utils/streamingBuffer.js';

import { useReveal } from './hooks/useReveal.js';

export default function Presentation({
    slides,
    manifest,
    theme = 'dark',
    transition = 'slide',
    controls = true,
    progress = true,
}) {
    const revealDivRef = useRef(null);
    const buffersRef = useRef({});
    const baseSlidesRef = useRef(slides);
    const isNavigatingProgrammatically = useRef(false);
    const streamingSlideIdRef = useRef(null);

    const [mode, setMode] = useState('view');
    const [selectedElement, setSelectedElement] = useState(null);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [streamingSlides, setStreamingSlides] = useState({});

    // Auto-navigation state
    const [pendingNavigationSlideId, setPendingNavigationSlideId] = useState(null);
    const [isAutoNavigationEnabled, setIsAutoNavigationEnabled] = useState(true);

    // Streaming mode state
    const [isStreamingSlide, setIsStreamingSlide] = useState(false);

    useEffect(() => {
        baseSlidesRef.current = slides;
    }, [slides]);

    // Merge loaded slides with streaming slides
    const mergedSlides = useMemo(() => {
        const slideMap = {};
        slides.forEach(slide => { slideMap[slide.id] = slide; });
        Object.entries(streamingSlides).forEach(([path, slideData]) => {
            if (slideData && slideData.id) {
                slideMap[slideData.id] = slideData;
            }
        });
        const result = slides.map(s => slideMap[s.id] || s);
        const newStreamingSlides = Object.values(streamingSlides).filter(
            s => s && s.id && !slides.some(existing => existing.id === s.id)
        );
        return [...result, ...newStreamingSlides];
    }, [slides, streamingSlides]);

    // Use the custom hook
    const { deck, isReady, sync } = useReveal(revealDivRef, {
        controls,
        progress,
        center: false,
        hash: true,
        transition,
        keyboard: mode === 'view',
        touch: mode === 'view',
        mouseWheel: mode === 'view',
    });

    // Check for showAllFragments URL parameter
    const showAllFragments = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('showAllFragments') === 'true';
    }, []);

    // Configure fragments visibility based on mode
    useEffect(() => {
        if (!deck) return;

        const shouldShowAllFragments = isStreamingSlide || showAllFragments;

        // When streaming or showing all fragments, we disable the fragment system
        // which causes all fragments to be visible immediately
        deck.configure({
            fragments: !shouldShowAllFragments
        });

        console.debug(`[Presentation] Fragment system ${shouldShowAllFragments ? 'disabled (showing all)' : 'enabled'}`);

    }, [deck, isStreamingSlide, showAllFragments]);

    // Sync when slides change AND handle auto-navigation
    useEffect(() => {
        if (!deck || !isReady) return;

        sync();

        // After sync, check if we should auto-navigate to a pending slide
        if (pendingNavigationSlideId && isAutoNavigationEnabled) {
            requestAnimationFrame(() => {
                const targetIndex = mergedSlides.findIndex(s => s.id === pendingNavigationSlideId);

                if (targetIndex !== -1) {
                    console.log(`[Presentation] Auto-navigating to slide ${targetIndex} (${pendingNavigationSlideId})`);

                    isNavigatingProgrammatically.current = true;

                    // Navigate to the slide at first fragment
                    // If streaming mode is active, CSS will show all fragments immediately
                    deck.slide(targetIndex, 0);

                    requestAnimationFrame(() => {
                        isNavigatingProgrammatically.current = false;
                    });

                    setPendingNavigationSlideId(null);
                }
            });
        }
    }, [mergedSlides, deck, isReady, sync, pendingNavigationSlideId, isAutoNavigationEnabled]);

    // Setup event listeners once deck is ready
    useEffect(() => {
        if (!deck || !isReady) return;

        // Send ready message
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'REVEAL_READY',
                data: {
                    totalSlides: deck.getTotalSlides(),
                    currentSlide: deck.getIndices(),
                },
            }, '*');
        }

        const onSlideChanged = (event) => {
            setCurrentSlideIndex(event.indexh);

            // If this slide change was not programmatic, user navigated manually
            // Disable auto-navigation to respect user's intent
            if (!isNavigatingProgrammatically.current) {
                setIsAutoNavigationEnabled(false);
            }

            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'SLIDE_CHANGED',
                    data: { currentSlide: event.indexh },
                }, '*');
            }
        };

        deck.on('slidechanged', onSlideChanged);
        return () => deck.off('slidechanged', onSlideChanged);
    }, [deck, isReady]);

    const mergeWithBase = useCallback((incoming) => {
        const base = baseSlidesRef.current.find((s) => s.id === incoming?.id);
        if (!base) return incoming;
        return {
            ...base,
            ...incoming,
            canvas: incoming.canvas || base.canvas,
            root: incoming.root || base.root,
            metadata: incoming.metadata || base.metadata,
        };
    }, []);

    // Handle mode changes
    useEffect(() => {
        if (deck && mode) {
            deck.configure({
                keyboard: mode === 'view',
                touch: mode === 'view',
                mouseWheel: mode === 'view',
            });
        }
    }, [mode, deck]);

    // Listen for file events directly from parent window (simplified communication)
    useEffect(() => {
        if (window.parent === window) return; // Not in iframe, skip

        const handleFileEvent = (event) => {
            try {
                const message = event.detail;

                switch (message.type) {
                    case 'file_generating':
                        if (message.path && message.path.includes('slides/')) {
                            console.log('[Presentation] File generating:', message.path);
                            buffersRef.current[message.path] = new StreamingBuffer();
                            setIsAutoNavigationEnabled(true);
                            setIsStreamingSlide(true);

                            const filename = message.path.split('/').pop();
                            const slideIndex = manifest?.slides?.findIndex(s => s === filename);

                            if (slideIndex !== -1 && slides[slideIndex]) {
                                const slideId = slides[slideIndex].id;
                                console.log(`[Presentation] Existing streaming slide: ${filename} -> ${slideId}`);
                                setPendingNavigationSlideId(slideId);
                                streamingSlideIdRef.current = slideId;
                            } else {
                                console.log(`[Presentation] New streaming slide: ${filename}`);
                                streamingSlideIdRef.current = null;
                            }
                        }
                        break;

                    case 'file_chunk':
                        if (message.path && buffersRef.current[message.path]) {
                            try {
                                buffersRef.current[message.path].addChunk(message.chunk);
                                const parsed = validateAndFixSlide(buffersRef.current[message.path].tryParse());

                                // Check if validation failed and returned a placeholder
                                // We don't want to flash "Invalid slide content" during streaming
                                const isPlaceholder = parsed.root?.children?.[0]?.text === 'Invalid slide content';

                                if (!isPlaceholder) {
                                    const merged = mergeWithBase(parsed);
                                    setStreamingSlides(prev => ({ ...prev, [message.path]: merged }));

                                    if (streamingSlideIdRef.current === null && parsed.id) {
                                        console.log(`[Presentation] First parse for new slide: ${parsed.id}`);
                                        setPendingNavigationSlideId(parsed.id);
                                        streamingSlideIdRef.current = parsed.id;
                                    }
                                }
                            } catch (error) {
                                // Buffer incomplete, waiting for more chunks
                            }
                        }
                        break;

                    case 'file_generated':
                        if (message.path && message.path.includes('slides/')) {
                            console.log('[Presentation] File generated:', message.path);
                            delete buffersRef.current[message.path];
                            if (message.contents) {
                                try {
                                    const parsed = validateAndFixSlide(JSON.parse(message.contents));
                                    const merged = mergeWithBase(parsed);
                                    setStreamingSlides(prev => ({ ...prev, [message.path]: merged }));
                                    setIsStreamingSlide(false);
                                } catch (error) {
                                    console.error('[Presentation] Failed to parse generated file:', error);
                                }
                            }
                        }
                        break;
                }
            } catch (error) {
                console.error('[Presentation] Error handling file event:', error);
            }
        };

        // Listen to file events forwarded via postMessage
        const handleMessage = (event) => {
            // We expect messages forwarded from parent with type 'file_generating', 'file_chunk', etc.
            // The parent forwards the CustomEvent detail as the message data
            const message = event.data;
            if (!message || !message.type) return;

            // Filter for relevant event types
            if (['file_generating', 'file_chunk', 'file_generated'].includes(message.type)) {
                handleFileEvent({ detail: message });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [slides, manifest, mergeWithBase]);

    // Listen for messages from parent editor / preview bridge
    useEffect(() => {
        const handleMessage = (event) => {
            try {
                const message = event.data;

                switch (message.type) {
                    case 'SET_MODE':
                        if (message.data.mode) {
                            setMode(message.data.mode);
                        }
                        break;

                    case 'NAVIGATE_TO_SLIDE':
                        console.log('[Presentation] Received NAVIGATE_TO_SLIDE message:', message.data);
                        console.log('[Presentation] Reveal deck available:', !!deck);
                        if (deck && message.data && typeof message.data.index === 'number') {
                            console.log('[Presentation] Navigating to slide index:', message.data.index);
                            deck.slide(message.data.index);
                        } else {
                            console.warn('[Presentation] Cannot navigate - missing deck or invalid index:', {
                                hasDeck: !!deck,
                                hasData: !!message.data,
                                indexType: typeof message.data?.index
                            });
                        }
                        break;

                    case 'SELECT_ELEMENT':
                        if (message.data.slideIndex !== undefined && message.data.elementId) {
                            setSelectedElement({
                                slideIndex: message.data.slideIndex,
                                elementId: message.data.elementId,
                            });
                        } else {
                            setSelectedElement(null);
                        }
                        break;

                    case 'RELOAD_SLIDE':
                        const slideFile = message.data.slideId;
                        console.log('[Presentation] Reloading slide:', slideFile);

                        fetch(`/slides/${slideFile}`, { cache: 'no-store' })
                            .then(res => res.json())
                            .then(data => {
                                const parsed = validateAndFixSlide(data);
                                const sanitized = mergeWithBase(parsed);
                                // Update streamingSlides to force re-render with new data
                                // We use the file path as key to match how streaming updates work
                                setStreamingSlides(prev => ({
                                    ...prev,
                                    [`slides/${slideFile}`]: sanitized
                                }));
                            })
                            .catch(err => console.error('[Presentation] Failed to reload slide:', err));
                        break;

                    case 'CREATE_ELEMENT':
                        console.log('[Presentation] Create element requested:', message.data);
                        break;

                    case 'DELETE_ELEMENT':
                        console.log('[Presentation] Delete element requested:', message.data);
                        break;
                }
            } catch (error) {
                console.error('[Presentation] Error handling message:', error);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [mergeWithBase, deck]); // Added deck to dependencies



    // Inject hover styles for edit mode
    useEffect(() => {
        if (mode !== 'edit') return;

        const styleId = 'editor-hover-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                [data-id] {
                    cursor: pointer !important;
                    transition: outline 0.1s ease;
                }
                [data-id]:hover {
                    outline: 2px solid #60a5fa !important;
                    outline-offset: 2px;
                    z-index: 100;
                }
                /* Disable interactions on interactive elements in edit mode */
                a, button, input {
                    pointer-events: none;
                }
                /* Re-enable pointer events for data-id elements so they can be clicked */
                [data-id] {
                    pointer-events: auto !important;
                }
            `;
            document.head.appendChild(style);
        }

        return () => {
            const style = document.getElementById(styleId);
            if (style) style.remove();
        };
    }, [mode]);

    // Send element update to parent
    const handleElementUpdate = useCallback(
        (slideIndex, elementId, updates) => {
            const message = {
                type: 'ELEMENT_UPDATED',
                data: {
                    slideIndex,
                    elementId,
                    updates,
                },
            };

            if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }
        },
        []
    );

    // Send element selection to parent
    const handleElementSelect = useCallback(
        (slideIndex, elementId) => {
            setSelectedElement({ slideIndex, elementId });

            const message = {
                type: 'ELEMENT_SELECTED',
                data: {
                    slideIndex,
                    elementId,
                },
            };

            if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }
        },
        []
    );

    // Send element delete to parent
    const handleElementDelete = useCallback(
        (slideIndex, elementId) => {
            const message = {
                type: 'ELEMENT_DELETED',
                data: {
                    slideIndex,
                    elementId,
                },
            };

            if (window.parent !== window) {
                window.parent.postMessage(message, '*');
            }

            setSelectedElement(null);
        },
        []
    );

    // Handle click selection in edit mode
    useEffect(() => {
        if (mode !== 'edit' || !revealDivRef.current) return;

        const handleClick = (e) => {
            // Select the actual clicked element, not parent
            // Check if the target itself has data-id first
            let target = null;
            if (e.target.hasAttribute('data-id')) {
                target = e.target;
            } else {
                // Only if target doesn't have data-id, look for closest parent
                target = e.target.closest('[data-id]');
            }

            if (target) {
                e.preventDefault();
                e.stopPropagation();
                const elementId = target.getAttribute('data-id');
                handleElementSelect(currentSlideIndex, elementId);
            } else {
                // Deselect if clicking background
                setSelectedElement(null);
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'ELEMENT_SELECTED', data: null }, '*');
                }
            }
        };

        const revealEl = revealDivRef.current;
        revealEl.addEventListener('click', handleClick, true); // Capture phase to prevent links/buttons from firing
        return () => revealEl.removeEventListener('click', handleClick, true);
    }, [mode, currentSlideIndex, handleElementSelect]);

    return (
        <div
            className="reveal"
            ref={revealDivRef}
            style={{
                width: '100%',
                height: '100%',
            }}
        >
            <div className="slides">
                {mergedSlides.map((slide, index) => (
                    <section
                        key={slide.id}
                        data-slide-id={slide.id}
                    >
                        {slide && slide.root && (
                            <SlideRenderer
                                slide={slide}
                            />
                        )}
                    </section>
                ))}
            </div>

            {/* Editor overlay - simple selection indicator */}
            <EditorOverlay
                mode={mode}
                selectedElement={selectedElement}
                onUpdate={handleElementUpdate}
                onDelete={handleElementDelete}
            />

            {/* Mode indicator (edit mode) */}
            {mode === 'edit' && (
                <div
                    style={{
                        position: 'fixed',
                        top: 16,
                        right: 16,
                        padding: '8px 16px',
                        background: 'rgba(102, 126, 234, 0.9)',
                        color: 'white',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        zIndex: 9999,
                        pointerEvents: 'none',
                    }}
                >
                    Edit Mode
                </div>
            )}
        </div>
    );
}
