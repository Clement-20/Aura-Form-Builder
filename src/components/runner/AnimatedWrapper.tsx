import React, { useEffect, useState } from 'react';
import { FormTheme } from '../../types/form';

interface AnimatedWrapperProps {
  theme: FormTheme;
  animationType?: 'intro' | 'transition' | 'outro';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const AnimatedWrapper: React.FC<AnimatedWrapperProps> = ({
  theme,
  animationType = 'transition',
  children,
  className = '',
  style = {},
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), theme.animationDelay || 20);
    return () => clearTimeout(timer);
  }, [theme.animationDelay]);

  // Check reduced motion preference
  const prefersReducedMotion =
    theme.respectReducedMotion !== false &&
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const duration = prefersReducedMotion ? 0 : theme.animationDuration || 300;
  const easing = {
    'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
    'ease-in': 'ease-in',
    'ease-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
    'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    'ease': 'ease',
  }[theme.animationEasing || 'ease-out'];

  const getAnimationStyle = () => {
    if (prefersReducedMotion || duration === 0) return {};

    let transformStart = 'translateY(12px)';
    if (theme.animationPreset === 'slide-horizontal') transformStart = 'translateX(20px)';
    if (theme.animationPreset === 'fade-scale' || animationType === 'intro') transformStart = 'scale(0.97)';
    if (animationType === 'outro') transformStart = 'scale(1.02)';

    return {
      transition: `all ${duration}ms ${easing}`,
      opacity: isMounted ? 1 : 0,
      transform: isMounted ? 'none' : transformStart,
    };
  };

  return (
    <div className={`relative ${className}`} style={{ ...getAnimationStyle(), ...style }}>
      {/* Optional Background Video Asset Handling */}
      {theme.videoBackgroundUrl && animationType === 'intro' && (
        <video
          src={theme.videoBackgroundUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-20 z-0 rounded-2xl overflow-hidden"
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
