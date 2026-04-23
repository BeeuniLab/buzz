import React from 'react';

/**
 * Animated Mesh Gradient Background
 * Creates smooth, animated multi-point gradients for modern visual appeal
 */
export function MeshGradient({ colors = ['#667eea', '#764ba2', '#f093fb'], animation = 'slow' }) {
  const animationDurations = {
    none: '0s',
    slow: '30s',
    medium: '20s',
    fast: '12s'
  };

  const duration = animationDurations[animation] || animationDurations.slow;

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(at 27% 37%, ${colors[0]}33 0px, transparent 50%),
            radial-gradient(at 97% 21%, ${colors[1] || colors[0]}33 0px, transparent 50%),
            radial-gradient(at 52% 99%, ${colors[2] || colors[0]}33 0px, transparent 50%),
            radial-gradient(at 10% 29%, ${colors[0]}26 0px, transparent 50%),
            radial-gradient(at 97% 96%, ${colors[1] || colors[0]}26 0px, transparent 50%),
            radial-gradient(at 33% 50%, ${colors[2] || colors[0]}26 0px, transparent 50%),
            radial-gradient(at 79% 53%, ${colors[0]}1a 0px, transparent 50%)
          `,
          backgroundSize: '400% 400%',
          animation: animation !== 'none' ? `meshMove ${duration} ease-in-out infinite` : 'none',
          willChange: animation !== 'none' ? 'background-position' : 'auto'
        }}
      />
    </div>
  );
}
