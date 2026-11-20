import React, { useId } from 'react';

interface AuraLogoProps {
  className?: string;
  size?: number;
  animate?: boolean;
  tone?: 'dark' | 'light';
}

export const AuraLogo: React.FC<AuraLogoProps> = ({
  className = 'w-8 h-8',
  size = 32,
  animate = false,
  tone = 'dark',
}) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `aura-tile-${uid}`;
  const accentId = `aura-emerald-${uid}`;

  const isLight = tone === 'light';

  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      {animate && (
        <span
          aria-hidden="true"
          className="absolute -inset-1 rounded-[12px] bg-emerald-500/20 blur-sm animate-pulse"
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            {isLight ? (
              <>
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#E6E4DD" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#1B1F24" />
                <stop offset="100%" stopColor="#090B0D" />
              </>
            )}
          </linearGradient>
          <linearGradient id={accentId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
        </defs>

        {/* Machined base tile */}
        <rect
          width="36"
          height="36"
          rx="10"
          fill={`url(#${gradId})`}
        />
        <rect
          x="0.5"
          y="0.5"
          width="35"
          height="35"
          rx="9.5"
          stroke={isLight ? 'rgba(11,13,15,0.1)' : 'rgba(255,255,255,0.14)'}
        />

        {/* Orbital precision arc */}
        <g
          className={animate ? 'animate-aura-orbit' : ''}
          style={{ transformOrigin: '18px 18px' }}
        >
          <path
            d="M7.5 18C7.5 12.201 12.201 7.5 18 7.5"
            stroke={`url(#${accentId})`}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M28.5 18C28.5 23.799 23.799 28.5 18 28.5"
            stroke={isLight ? 'rgba(11,13,15,0.22)' : 'rgba(255,255,255,0.22)'}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>

        {/* Geometric architectural A-chevron */}
        <path
          d="M11.6 25.5L18 11L24.4 25.5H21.2L18 18.1L14.8 25.5H11.6Z"
          fill={isLight ? '#0B0D0F' : '#F7F6F3'}
        />

        {/* Emerald signal vertex */}
        <circle
          cx="18"
          cy="14"
          r="2.1"
          fill={`url(#${accentId})`}
          className={animate ? 'animate-aura-node' : ''}
        />
      </svg>
    </span>
  );
};
