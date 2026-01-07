import React from 'react';
import { Plus } from 'lucide-react';

interface AddRepositoryCardProps {
  onClick: () => void;
}

const AddRepositoryCard: React.FC<AddRepositoryCardProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="w-full h-full min-h-[250px] bg-bg-800 border-2 border-dashed border-slate-700 hover:border-apex-500 transition-all duration-300 p-6 group relative overflow-hidden flex items-center justify-center"
    >
      {/* Hover effect */}
      <div className="absolute inset-0 bg-apex-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      {/* Content */}
      <div className="relative z-10 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 group-hover:border-apex-500 flex items-center justify-center mx-auto mb-4 transition-colors">
          <Plus size={32} className="text-slate-600 group-hover:text-apex-500 transition-colors" />
        </div>
        <h3 className="text-lg font-bold text-slate-500 group-hover:text-white transition-colors uppercase font-sans tracking-wider">
          Connect Repository
        </h3>
        <p className="text-xs text-slate-600 mt-2 font-mono">
          Add a new repository to monitor
        </p>
      </div>

      {/* Animated corner accent */}
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-apex-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-0 group-hover:translate-y-0 translate-x-2 -translate-y-2"></div>
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-apex-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-0 group-hover:translate-y-0 -translate-x-2 translate-y-2"></div>
    </button>
  );
};

export default AddRepositoryCard;



