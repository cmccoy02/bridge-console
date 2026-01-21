import React, { useState } from 'react';
import { AlertTriangle, Terminal, ChevronDown, ChevronUp, ExternalLink, FileCode, AlertCircle } from 'lucide-react';

interface TodoItem {
  file: string;
  line: number;
  type: string;
  text: string;
  context: string;
}

interface ConsoleLogItem {
  file: string;
  line: number;
  type: string;
  context: string;
}

interface CodeIssuesProps {
  todoItems?: TodoItem[];
  consoleLogItems?: ConsoleLogItem[];
  todoCount: number;
  consoleLogCount: number;
  repoUrl: string;
  defaultBranch?: string;
}

const CodeIssues: React.FC<CodeIssuesProps> = ({
  todoItems = [],
  consoleLogItems = [],
  todoCount,
  consoleLogCount,
  repoUrl,
  defaultBranch = 'main'
}) => {
  const [showTodos, setShowTodos] = useState(false);
  const [showConsoleLogs, setShowConsoleLogs] = useState(false);

  // Convert repo URL to GitHub blob URL
  const getFileUrl = (file: string, line: number) => {
    const baseUrl = repoUrl.replace('.git', '');
    return `${baseUrl}/blob/${defaultBranch}/${file}#L${line}`;
  };

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'FIXME':
      case 'XXX':
        return 'text-red-400 bg-red-950/30';
      case 'HACK':
        return 'text-orange-400 bg-orange-950/30';
      case 'TODO':
      default:
        return 'text-yellow-400 bg-yellow-950/30';
    }
  };

  const getConsoleTypeColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* TODOs Section */}
      {todoCount > 0 && (
        <div className="bg-bg-800 border border-slate-800">
          <button
            onClick={() => setShowTodos(!showTodos)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-yellow-500" />
              <span className="text-sm font-bold text-slate-300">
                TODO/FIXME Comments
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${todoCount > 20 ? 'bg-red-950/50 text-red-400' : 'bg-yellow-950/50 text-yellow-400'}`}>
                {todoCount} found
              </span>
              {todoItems.length < todoCount && (
                <span className="text-[10px] text-slate-500">
                  (showing {todoItems.length})
                </span>
              )}
            </div>
            {showTodos ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </button>

          {showTodos && todoItems.length > 0 && (
            <div className="border-t border-slate-800 max-h-[400px] overflow-y-auto">
              {todoItems.map((item, idx) => (
                <a
                  key={idx}
                  href={getFileUrl(item.file, item.line)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors group"
                >
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getTypeColor(item.type)}`}>
                    {item.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <FileCode size={12} className="text-slate-500" />
                      <span className="text-slate-400 font-mono truncate">{item.file}</span>
                      <span className="text-slate-600">:</span>
                      <span className="text-apex-500 font-mono">{item.line}</span>
                    </div>
                    {item.text && (
                      <div className="text-xs text-slate-300 mt-1 truncate">
                        {item.text}
                      </div>
                    )}
                  </div>
                  <ExternalLink size={14} className="text-slate-600 group-hover:text-apex-500 transition-colors flex-shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}

          {showTodos && todoItems.length === 0 && (
            <div className="border-t border-slate-800 p-4 text-center text-slate-500 text-xs">
              Location details not available for older scans. Re-scan to get detailed locations.
            </div>
          )}
        </div>
      )}

      {/* Console Logs Section */}
      {consoleLogCount > 0 && (
        <div className="bg-bg-800 border border-slate-800">
          <button
            onClick={() => setShowConsoleLogs(!showConsoleLogs)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Terminal size={16} className="text-slate-400" />
              <span className="text-sm font-bold text-slate-300">
                Console Statements
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${consoleLogCount > 20 ? 'bg-orange-950/50 text-orange-400' : 'bg-slate-800 text-slate-400'}`}>
                {consoleLogCount} found
              </span>
              {consoleLogItems.length < consoleLogCount && (
                <span className="text-[10px] text-slate-500">
                  (showing {consoleLogItems.length})
                </span>
              )}
            </div>
            {showConsoleLogs ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </button>

          {showConsoleLogs && consoleLogItems.length > 0 && (
            <div className="border-t border-slate-800 max-h-[400px] overflow-y-auto">
              {consoleLogItems.map((item, idx) => (
                <a
                  key={idx}
                  href={getFileUrl(item.file, item.line)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors group"
                >
                  <span className={`text-[10px] font-mono ${getConsoleTypeColor(item.type)}`}>
                    .{item.type}()
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <FileCode size={12} className="text-slate-500" />
                      <span className="text-slate-400 font-mono truncate">{item.file}</span>
                      <span className="text-slate-600">:</span>
                      <span className="text-apex-500 font-mono">{item.line}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1 truncate">
                      {item.context}
                    </div>
                  </div>
                  <ExternalLink size={14} className="text-slate-600 group-hover:text-apex-500 transition-colors flex-shrink-0 mt-1" />
                </a>
              ))}
            </div>
          )}

          {showConsoleLogs && consoleLogItems.length === 0 && (
            <div className="border-t border-slate-800 p-4 text-center text-slate-500 text-xs">
              Location details not available for older scans. Re-scan to get detailed locations.
            </div>
          )}
        </div>
      )}

      {/* No issues */}
      {todoCount === 0 && consoleLogCount === 0 && (
        <div className="bg-bg-800 border border-slate-800 p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-green-400">
            <AlertCircle size={16} />
            <span className="text-sm font-medium">No code quality issues found</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            No TODO comments or console.log statements detected
          </p>
        </div>
      )}
    </div>
  );
};

export default CodeIssues;
