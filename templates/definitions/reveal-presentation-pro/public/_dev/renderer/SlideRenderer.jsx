import React from 'react';
import { SlideBackground } from './backgrounds/SlideBackground.jsx';

// Generate a unique ID if one doesn't exist
export function renderSlideElement(element, key = 0, pathPrefix = '') {
    if (!element) return null;

    const elementId = element.id || `${pathPrefix}-${element.type}-${key}`;

    // Handle SVG icons (legacy format)
    if (element.type === 'svg' && element.icon) {
        const IconComponent = window.LucideReact?.[element.icon];

        if (!IconComponent) {
            console.warn(`Icon "${element.icon}" not found in LucideReact`);
            return null;
        }

        const iconProps = {
            key,
            className: element.className,
            'data-id': elementId,
            ...element.props
        };

        if (element.size) {
            iconProps.size = element.size;
        }

        return React.createElement(IconComponent, iconProps);
    }

    // Handle 'Icon' type (new format)
    if (element.type === 'Icon') {
        const iconName = element.props?.name;
        const IconComponent = window.LucideReact?.[iconName];

        if (!IconComponent) {
            console.warn(`Icon "${iconName}" not found in LucideReact`);
            return null;
        }

        const { name, ...otherProps } = element.props || {};
        const iconProps = {
            key,
            className: element.className,
            'data-id': elementId,
            ...otherProps
        };

        return React.createElement(IconComponent, iconProps);
    }

    // Handle Rich Components (Recharts, SlideTemplates)
    const RichComponent = window.Recharts?.[element.type] || window.SlideTemplates?.[element.type];
    if (RichComponent) {
        const componentProps = {
            key,
            className: element.className,
            'data-id': elementId,
            ...element.props
        };

        // CRITICAL: Process children for custom components just like HTML elements
        const children = [];
        if (element.text) {
            children.push(element.text);
        }
        if (element.children && Array.isArray(element.children)) {
            element.children.forEach((child, index) => {
                children.push(renderSlideElement(child, index, `${pathPrefix}-${key}`));
            });
        }

        // Pass children to component
        return React.createElement(RichComponent, componentProps, children.length > 0 ? children : null);
    }

    // Build props for React element
    const props = {
        key,
        'data-id': elementId,
    };

    // Add className
    if (element.className) {
        props.className = element.className;
    }

    // Add role
    if (element.role) {
        props.role = element.role;
    }

    // Add aria-level
    if (element.ariaLevel) {
        props['aria-level'] = element.ariaLevel;
    }

    // Add data-fragment-index
    if (element['data-fragment-index'] !== undefined) {
        props['data-fragment-index'] = element['data-fragment-index'];
    }

    // Add data-transition
    if (element['data-transition']) {
        props['data-transition'] = element['data-transition'];
    }

    // Build children
    const children = [];

    // Add text content if present
    if (element.text) {
        children.push(element.text);

        // Add streaming cursor if element is being streamed
        if (element._streaming) {
            children.push(
                React.createElement('span', {
                    key: 'cursor',
                    className: 'typing-cursor inline-block ml-1 animate-pulse text-purple-400'
                }, '▊')
            );
        }
    }

    // Add nested children if present
    if (element.children && Array.isArray(element.children)) {
        element.children.forEach((child, index) => {
            children.push(renderSlideElement(child, index, `${pathPrefix}-${key}`));
        });
    }

    // Create React element
    return React.createElement(
        element.type,
        props,
        children.length > 0 ? children : null
    );
}

/**
 * Renders a complete slide from JSON
 */
export function SlideRenderer({ slide }) {
    if (!slide || !slide.root) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-4xl text-red-400">Invalid slide data</p>
            </div>
        );
    }

    const background = slide.metadata?.background;

    return (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            {background && <SlideBackground background={background} />}
            <div style={{ position: 'relative', zIndex: 10, height: '100%' }}>
                {renderSlideElement(slide.root, 0, slide.id)}
            </div>
        </div>
    );
}
