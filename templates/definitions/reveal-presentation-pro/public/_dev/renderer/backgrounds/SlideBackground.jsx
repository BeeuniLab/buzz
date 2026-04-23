import React from 'react';
import { MeshGradient } from './MeshGradient.jsx';
import { ParticleBackground } from './ParticleBackground.jsx';

/**
 * Unified Background Renderer
 * Routes to appropriate background component based on type
 */
export function SlideBackground({ background }) {
  if (!background) return null;

  const { type, colors, color, animation = 'slow', count, speed } = background;

  switch (type) {
    case 'mesh':
      return <MeshGradient colors={colors} animation={animation} />;

    case 'particles':
      return <ParticleBackground count={count} color={color} speed={speed || animation} />;

    case 'mesh-particles':
      return (
        <>
          <MeshGradient colors={colors} animation={animation} />
          <ParticleBackground count={count || 30} color={color || colors?.[0]} speed={speed || animation} />
        </>
      );

    case 'gradient':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: Array.isArray(colors)
              ? `linear-gradient(135deg, ${colors.join(', ')})`
              : colors || color,
            zIndex: 0
          }}
        />
      );

    case 'solid':
      return (
        <div
          className="absolute inset-0"
          style={{
            background: color || colors,
            zIndex: 0
          }}
        />
      );

    default:
      console.warn(`Unknown background type: ${type}`);
      return null;
  }
}
