import React, { useMemo } from 'react';

/**
 * Particle Background System
 * Lightweight floating particles for subtle ambient effects
 */
export function ParticleBackground({ count = 50, color = '#667eea', speed = 'medium' }) {
  const speedDurations = {
    slow: { min: 25, max: 40 },
    medium: { min: 15, max: 25 },
    fast: { min: 8, max: 15 }
  };

  const { min, max } = speedDurations[speed] || speedDurations.medium;

  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * (max - min) + min,
      delay: Math.random() * -20
    })), [count, min, max]
  );

  return (
    <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none" style={{ zIndex: 1 }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: color,
            filter: 'blur(1px)',
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            boxShadow: `0 0 ${p.size * 4}px ${color}`,
            willChange: 'transform'
          }}
        />
      ))}
    </div>
  );
}
