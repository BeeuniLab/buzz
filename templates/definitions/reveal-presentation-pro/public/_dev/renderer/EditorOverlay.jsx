import React, { useEffect, useState } from 'react';
import { Rnd } from 'react-rnd';

export function EditorOverlay({ mode, selectedElement, onUpdate, onDelete }) {
    const [elementInfo, setElementInfo] = useState(null);

    useEffect(() => {
        if (mode === 'edit' && selectedElement) {
            const element = document.querySelector(`[data-id="${selectedElement.elementId}"]`);
            if (element) {
                const rect = element.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(element);

                setElementInfo({
                    element,
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    originalTransform: computedStyle.transform
                });
            } else {
                setElementInfo(null);
            }
        } else {
            setElementInfo(null);
        }
    }, [mode, selectedElement]);

    if (!elementInfo) return null;

    return (
        <Rnd
            position={{ x: elementInfo.x, y: elementInfo.y }}
            size={{ width: elementInfo.width, height: elementInfo.height }}
            onDragStop={(e, d) => {
                onUpdate(selectedElement.slideIndex, selectedElement.elementId, {
                    position: { x: d.x, y: d.y }
                });
            }}
            onResizeStop={(e, direction, ref, delta, position) => {
                onUpdate(selectedElement.slideIndex, selectedElement.elementId, {
                    size: {
                        width: parseInt(ref.style.width),
                        height: parseInt(ref.style.height)
                    },
                    position
                });
            }}
            bounds="parent"
            style={{
                border: '2px solid #3b82f6',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.5)',
                zIndex: 10000,
            }}
            enableResizing={{
                top: true,
                right: true,
                bottom: true,
                left: true,
                topRight: true,
                bottomRight: true,
                bottomLeft: true,
                topLeft: true,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    top: -24,
                    left: 0,
                    background: '#3b82f6',
                    color: 'white',
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                }}
            >
                {selectedElement.elementId}
            </div>
        </Rnd>
    );
}
