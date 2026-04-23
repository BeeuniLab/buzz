import React from 'react';
import { createRoot } from 'react-dom/client';
import { jsxImport } from '../compiler/index.js';

async function bootstrap() {
    try {
        // Import App.jsx using the compiler
        const { default: App } = await jsxImport('/_dev/App.jsx');

        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
    } catch (error) {
        console.error('Failed to bootstrap application:', error);
        document.body.innerHTML = `<div style="color: red; padding: 20px;">Failed to load application: ${error.message}</div>`;
    }
}

bootstrap();
