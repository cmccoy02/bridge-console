import React from 'react';

interface LoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'pulse' | 'dots' | 'bar';
  className?: string;
  label?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 'md',
  variant = 'spinner',
  className = '',
  label,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  if (variant === 'spinner') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div
          className={`${sizeClasses[size]} border-2 border-slate-700 border-t-apex-500 rounded-full animate-spin`}
        />
        {label && <span className="text-xs text-slate-400 animate-pulse">{label}</span>}
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className={`${sizeClasses[size]} bg-apex-500/30 rounded-full animate-pulse`} />
        {label && <span className="text-xs text-slate-400">{label}</span>}
      </div>
    );
  }

  if (variant === 'dots') {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <div className="w-1.5 h-1.5 bg-apex-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-apex-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-apex-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        {label && <span className="text-xs text-slate-400 ml-2">{label}</span>}
      </div>
    );
  }

  if (variant === 'bar') {
    return (
      <div className={`${className}`}>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-apex-600 via-apex-400 to-apex-600 animate-loading-bar" />
        </div>
        {label && <span className="text-xs text-slate-400 mt-1 block">{label}</span>}
      </div>
    );
  }

  return null;
};

// Skeleton loader for content placeholders
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
  animate = true,
}) => {
  const baseClasses = `bg-slate-800 ${animate ? 'animate-pulse' : ''}`;

  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} style={style} />;
};

// Inline loading state for buttons and actions
interface InlineLoaderProps {
  loading: boolean;
  children: React.ReactNode;
  loadingText?: string;
}

export const InlineLoader: React.FC<InlineLoaderProps> = ({
  loading,
  children,
  loadingText = 'Loading...',
}) => {
  if (loading) {
    return (
      <span className="flex items-center gap-2">
        <LoadingIndicator size="sm" variant="spinner" />
        <span className="text-slate-400">{loadingText}</span>
      </span>
    );
  }
  return <>{children}</>;
};

// Progress bar with subtle animation
interface ProgressBarProps {
  progress: number; // 0-100
  showPercent?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'apex' | 'green' | 'blue' | 'yellow' | 'red';
  className?: string;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  showPercent = false,
  size = 'md',
  color = 'apex',
  className = '',
  label,
}) => {
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colorClasses = {
    apex: 'from-apex-600 to-apex-400',
    green: 'from-green-600 to-green-400',
    blue: 'from-blue-600 to-blue-400',
    yellow: 'from-yellow-600 to-yellow-400',
    red: 'from-red-600 to-red-400',
  };

  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-slate-400">{label}</span>}
          {showPercent && <span className="text-xs text-slate-500 font-mono">{Math.round(progress)}%</span>}
        </div>
      )}
      <div className={`${sizeClasses[size]} bg-slate-800 rounded-full overflow-hidden`}>
        <div
          className={`h-full bg-gradient-to-r ${colorClasses[color]} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
};

// Shimmer effect for loading states
export const ShimmerOverlay: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent ${className}`}
  />
);

// Status indicator dot with subtle pulse
interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'idle';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  pulse = true,
}) => {
  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    busy: 'bg-yellow-500',
    idle: 'bg-slate-500',
  };

  return (
    <span className="relative flex">
      <span className={`${sizeClasses[size]} ${statusColors[status]} rounded-full`} />
      {pulse && status === 'online' && (
        <span
          className={`absolute inset-0 ${sizeClasses[size]} ${statusColors[status]} rounded-full animate-ping opacity-75`}
        />
      )}
    </span>
  );
};

export default LoadingIndicator;
