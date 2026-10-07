import React from 'react';
import {
  LayoutDashboard,
  CandlestickChart,
  Target,
  Users,
  Crown,
  ScrollText,
  Skull,
  Brain,
  BarChart3,
  Eye,
  Puzzle,
  Settings,
  Terminal
} from 'lucide-react';

export type TabId =
  | 'dashboard'
  | 'market'
  | 'smc'
  | 'swarm'
  | 'queen'
  | 'paper'
  | 'graveyard'
  | 'patterns'
  | 'performance'
  | 'vision'
  | 'extension'
  | 'settings'
  | 'logs';

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  activePaperTradesCount: number;
  graveyardCount: number;
  queenStatus: string;
  errorCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  activePaperTradesCount,
  graveyardCount,
  queenStatus,
  errorCount = 0
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'vision', label: 'Mistral Vision', icon: Eye, badge: 'AI 👁', isHighlight: true },
    { id: 'market', label: 'Market', icon: CandlestickChart },
    { id: 'smc', label: 'SMC Engine', icon: Target },
    { id: 'swarm', label: 'Worker Swarm (20)', icon: Users },
    { id: 'queen', label: 'Queen Fly', icon: Crown, badge: queenStatus !== 'NO_SIGNAL' ? queenStatus : undefined },
    { id: 'paper', label: 'Paper Trading', icon: ScrollText, count: activePaperTradesCount },
    { id: 'graveyard', label: 'Graveyard', icon: Skull, count: graveyardCount },
    { id: 'patterns', label: 'Pattern Memory', icon: Brain },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
    { id: 'extension', label: 'Extension Hub', icon: Puzzle },
    { id: 'settings', label: 'Settings', icon: Settings },
    {
      id: 'logs',
      label: 'Logs & Errors',
      icon: Terminal,
      count: errorCount > 0 ? errorCount : undefined,
      isErrorCount: errorCount > 0
    }
  ];

  return (
    <nav className="bg-zinc-950/90 border-b border-zinc-800/80 px-2 overflow-x-auto flex items-center gap-1 scrollbar-none select-none text-xs font-mono">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id as TabId)}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 whitespace-nowrap transition-colors font-medium ${
              isActive
                ? 'border-sky-500 text-sky-400 bg-zinc-900/60'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-400' : (tab as any).isHighlight ? 'text-emerald-400' : 'text-zinc-500'}`} />
            <span className={(tab as any).isHighlight && !isActive ? 'text-emerald-300 font-semibold' : ''}>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  (tab as any).isErrorCount
                    ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {tab.count}
              </span>
            )}
            {tab.badge && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                  (tab as any).isHighlight
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse'
                    : 'bg-sky-950 text-sky-400 border border-sky-800'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
