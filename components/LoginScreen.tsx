import React from 'react';
import { Github, Zap, Shield, TrendingUp } from 'lucide-react';
import { useAuth } from './AuthProvider';

const LoginScreen: React.FC = () => {
  const { login, loginDemo, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-bg-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        {/* Decorative elements */}
        <div className="absolute -top-8 -left-8 w-16 h-16 border-t-4 border-l-4 border-apex-500"></div>
        <div className="absolute -bottom-8 -right-8 w-16 h-16 border-b-4 border-r-4 border-apex-500"></div>

        <div className="bg-bg-800 border-2 border-slate-800 p-8 relative overflow-hidden">
          {/* Grid background */}
          <div className="absolute inset-0 opacity-5 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
          
          {/* Logo */}
          <div className="relative z-10 text-center mb-8">
            <div className="w-16 h-16 bg-apex-500 text-black flex items-center justify-center font-bold text-3xl mx-auto mb-4 clip-path-slant">
              B
            </div>
            <h1 className="text-2xl font-sans font-black text-white uppercase tracking-wider">
              Bridge <span className="text-apex-500">//</span> Console
            </h1>
            <p className="text-slate-500 text-xs font-mono mt-2">
              TECHNICAL DEBT INTELLIGENCE
            </p>
          </div>

          {/* Features */}
          <div className="relative z-10 grid grid-cols-3 gap-4 mb-8">
            <div className="text-center">
              <div className="w-10 h-10 bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto mb-2">
                <Zap size={18} className="text-apex-500" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">AI Analysis</span>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto mb-2">
                <Shield size={18} className="text-green-500" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Secure</span>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto mb-2">
                <TrendingUp size={18} className="text-blue-500" />
              </div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Insights</span>
            </div>
          </div>

          {/* Login Buttons */}
          <div className="relative z-10 space-y-3">
            <button
              onClick={login}
              disabled={isLoading}
              className="w-full py-4 bg-white hover:bg-gray-100 text-black font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Github size={20} />
              Continue with GitHub
            </button>

            <div className="flex items-center gap-4 my-4">
              <div className="h-px bg-slate-800 flex-1"></div>
              <span className="text-slate-600 text-xs font-mono">OR</span>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>

            <button
              onClick={loginDemo}
              disabled={isLoading}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold uppercase tracking-wider text-sm transition-colors border border-slate-800 disabled:opacity-50"
            >
              Try Demo Mode
            </button>
          </div>

          {/* Footer */}
          <div className="relative z-10 mt-8 text-center">
            <p className="text-[10px] text-slate-600 font-mono">
              By continuing, you agree to Bridge's Terms of Service
            </p>
          </div>
        </div>

        {/* Version tag */}
        <div className="text-center mt-4">
          <span className="text-[10px] text-slate-700 font-mono">v0.1.0 // MVP</span>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;



