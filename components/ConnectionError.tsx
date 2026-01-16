import React, { useState } from 'react';
import { WifiOff, RefreshCw, Server, AlertCircle } from 'lucide-react';

interface ConnectionErrorProps {
  onRetry: () => void;
  message?: string;
}

const ConnectionError: React.FC<ConnectionErrorProps> = ({ onRetry, message }) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    await onRetry();
    // Give it a moment before allowing another retry
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="w-24 h-24 bg-red-950/30 border border-red-900 flex items-center justify-center mx-auto mb-6 rounded-lg">
          <WifiOff size={48} className="text-red-500" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-sans font-bold text-white uppercase tracking-wider mb-3">
          Connection Lost
        </h2>

        {/* Message */}
        <p className="text-slate-400 font-mono text-sm mb-6">
          {message || 'Unable to connect to the Bridge server. The server may still be starting up.'}
        </p>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="inline-flex items-center gap-3 px-6 py-3 bg-apex-500 hover:bg-apex-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-black disabled:text-slate-400 font-bold uppercase tracking-wider transition-all"
        >
          <RefreshCw size={20} className={isRetrying ? 'animate-spin' : ''} />
          {isRetrying ? 'Retrying...' : 'Retry Connection'}
        </button>

        {/* Help Text */}
        <div className="mt-8 text-left bg-bg-800 border border-slate-800 p-4 rounded">
          <h4 className="text-sm font-mono text-apex-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            Troubleshooting
          </h4>
          <ul className="space-y-2 text-sm text-slate-400 font-mono">
            <li className="flex items-start gap-2">
              <Server size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span>Ensure the server is running on port 3001</span>
            </li>
            <li className="flex items-start gap-2">
              <Server size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span>Check that no firewall is blocking the connection</span>
            </li>
            <li className="flex items-start gap-2">
              <Server size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span>Try restarting the application</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ConnectionError;
