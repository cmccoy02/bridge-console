import React from 'react';
import { Rocket, GitBranch, BarChart3, Zap, ArrowRight, Terminal } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
      {/* Hero Section */}
      <div className="text-center max-w-2xl mx-auto">
        {/* Logo */}
        <div className="w-20 h-20 bg-apex-500 text-black flex items-center justify-center font-bold text-4xl mx-auto mb-6 clip-path-slant">
          B
        </div>

        <h1 className="text-4xl md:text-5xl font-sans font-black text-white uppercase tracking-wider mb-4">
          Welcome to <span className="text-apex-500">Bridge</span>
        </h1>

        <p className="text-lg text-slate-400 font-mono mb-8 max-w-lg mx-auto">
          Your command center for understanding and paying down technical debt across your repositories.
        </p>

        {/* CTA Button */}
        <button
          onClick={onGetStarted}
          className="inline-flex items-center gap-3 px-8 py-4 bg-apex-500 hover:bg-apex-400 text-black font-bold uppercase tracking-wider text-lg transition-all group"
        >
          <Rocket size={24} />
          Connect Your First Repository
          <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl mx-auto w-full">
        <FeatureCard
          icon={<GitBranch size={28} />}
          title="Dependency Analysis"
          description="Understand what's outdated, deprecated, or blocking your upgrades with intelligent prioritization."
        />
        <FeatureCard
          icon={<BarChart3 size={28} />}
          title="Health Scoring"
          description="Get a clear Bridge Score (1-100) that tracks your codebase health across 5 dimensions."
        />
        <FeatureCard
          icon={<Zap size={28} />}
          title="Actionable Tasks"
          description="Prioritized recommendations with effort/impact ratings so you know what to tackle first."
        />
      </div>

      {/* Quick Start Guide */}
      <div className="mt-16 max-w-2xl w-full">
        <div className="bg-bg-800 border border-slate-800 p-6 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-apex-500 to-transparent"></div>

          <h3 className="text-sm font-mono text-apex-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Terminal size={16} />
            Quick Start
          </h3>

          <ol className="space-y-3 font-mono text-sm">
            <li className="flex items-start gap-3 text-slate-300">
              <span className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-apex-500 flex-shrink-0">1</span>
              <span>Connect a GitHub repository (public or private with token)</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-apex-500 flex-shrink-0">2</span>
              <span>Bridge will clone and analyze your codebase (2-5 minutes)</span>
            </li>
            <li className="flex items-start gap-3 text-slate-300">
              <span className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-apex-500 flex-shrink-0">3</span>
              <span>Review your Bridge Score, dependency health, and actionable tasks</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};

const FeatureCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => {
  return (
    <div className="bg-bg-800 border border-slate-800 p-6 relative group hover:border-apex-500/50 transition-colors">
      {/* Corner accent */}
      <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-slate-700 group-hover:border-apex-500 transition-colors"></div>

      <div className="text-apex-500 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white uppercase tracking-wide mb-2">
        {title}
      </h3>
      <p className="text-sm text-slate-400 font-mono">
        {description}
      </p>
    </div>
  );
};

export default WelcomeScreen;
