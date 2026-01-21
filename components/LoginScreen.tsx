import React from 'react';
import { Github, Zap, Shield, TrendingUp, ArrowRight, Eye } from 'lucide-react';
import { useAuth } from './AuthProvider';

const LoginScreen: React.FC = () => {
  const { login, enterPreviewMode, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-bg-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg relative">
        {/* Decorative elements */}
        <div className="absolute -top-8 -left-8 w-16 h-16 border-t-4 border-l-4 border-apex-500"></div>
        <div className="absolute -bottom-8 -right-8 w-16 h-16 border-b-4 border-r-4 border-apex-500"></div>

        <div className="bg-bg-800 border-2 border-slate-800 p-8 relative overflow-hidden">
          {/* Grid background */}
          <div className="absolute inset-0 opacity-5 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]"></div>

          {/* Logo */}
          <div className="relative z-10 text-center mb-6">
            <div className="w-16 h-16 bg-apex-500 text-black flex items-center justify-center font-bold text-3xl mx-auto mb-4 clip-path-slant">
              B
            </div>
            <h1 className="text-2xl font-sans font-black text-white uppercase tracking-wider">
              Bridge <span className="text-apex-500">//</span> Console
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              Technical Debt Intelligence Platform
            </p>
          </div>

          {/* Value Props */}
          <div className="relative z-10 mb-8">
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded">
                <div className="w-10 h-10 bg-green-500/10 border border-green-500/30 flex items-center justify-center rounded">
                  <Shield size={18} className="text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Safe Dependency Updates</div>
                  <div className="text-xs text-slate-500">Validates changes before creating PRs</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded">
                <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 flex items-center justify-center rounded">
                  <TrendingUp size={18} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Health Score Tracking</div>
                  <div className="text-xs text-slate-500">Monitor technical debt across all repos</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded">
                <div className="w-10 h-10 bg-apex-500/10 border border-apex-500/30 flex items-center justify-center rounded">
                  <Zap size={18} className="text-apex-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">Actionable Insights</div>
                  <div className="text-xs text-slate-500">Prioritized tasks with effort estimates</div>
                </div>
              </div>
            </div>
          </div>

          {/* Login Buttons */}
          <div className="relative z-10 space-y-3">
            <button
              onClick={login}
              disabled={isLoading}
              className="w-full py-4 bg-white hover:bg-gray-100 text-black font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 disabled:opacity-50 group"
            >
              <Github size={20} />
              <span>Connect GitHub</span>
              <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <p className="text-center text-[11px] text-slate-500 px-4">
              Requires GitHub App installation. We only request permissions needed for scanning and creating PRs.
            </p>

            <div className="flex items-center gap-4 my-4">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span className="text-slate-600 text-xs font-mono">OR</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>

            <button
              onClick={enterPreviewMode}
              disabled={isLoading}
              className="w-full py-3 bg-transparent hover:bg-slate-900 text-slate-400 hover:text-white font-medium text-sm transition-colors border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Eye size={16} />
              Explore with Sample Data
            </button>

            <p className="text-center text-[11px] text-slate-600">
              See what Bridge can do without connecting your repos
            </p>
          </div>

          {/* Install App Link */}
          <div className="relative z-10 mt-6 p-3 bg-apex-500/5 border border-apex-500/20 rounded">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">First time?</span>
              <a
                href="https://github.com/apps/bridge-console-dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-apex-500 hover:text-apex-400 font-medium flex items-center gap-1"
              >
                Install the GitHub App
                <ArrowRight size={12} />
              </a>
            </div>
          </div>
        </div>

        {/* Version tag */}
        <div className="text-center mt-4">
          <span className="text-[10px] text-slate-700 font-mono">v0.2.0 // Beta</span>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
