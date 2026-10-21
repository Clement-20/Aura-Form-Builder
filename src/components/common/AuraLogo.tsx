import React from 'react';

interface AuraLogoProps {
  className?: string;
  size?: number;
  animate?: boolean;
}

export const AuraLogo: React.FC<AuraLogoProps> = ({
  className = 'w-8 h-8',
  size = 32,
  animate = false,
}) => {
  return (
    <div className={`relative flex items-center justify-center group ${className}`}>
      {/* Outer ambient glow ring during animation */}
      {animate && (
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-60 animate-pulse" />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative transition-transform duration-500 group-hover:scale-105 ${
          animate ? 'animate-spin' : ''
        }`}
      >
        <defs>
          <linearGradient id="aura-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="50%" stopColor="#9333EA" />
            <stop offset="100%" stopColor="#DB2777" />
          </linearGradient>
          <filter id="aura-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        {/* Rounded dynamic base tile */}
        <rect width="36" height="36" rx="10" fill="url(#aura-logo-grad)" />
        {/* Geometric vector crystal / A-form chevron */}
        <path
          d="M11 26L18 10L25 26H21.5L18 18.5L14.5 26H11Z"
          fill="white"
          fillOpacity="0.95"
        />
        {/* Core spark node */}
        <circle cx="18" cy="14" r="2.5" fill="white" filter="url(#aura-glow)" />
        {/* Orbital arc */}
        <path
          d="M7 18C7 11.9249 11.9249 7 18 7V10C13.5817 10 10 13.5817 10 18H7Z"
          fill="white"
          fillOpacity="0.5"
        />
      </svg>
    </div>
  );
};
