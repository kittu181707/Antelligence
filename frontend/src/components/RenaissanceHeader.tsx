import { CalendarDays, Route, BarChart3, Map as MapIcon, History, Settings, Sparkles } from 'lucide-react';
import { Brand } from './Brand';
import type { NavTab } from './BottomNav';

interface RenaissanceHeaderProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onDemo?: () => void;
  busy?: boolean;
  isDemo?: boolean;
}

export function RenaissanceHeader({
  activeTab,
  onTabChange,
  onDemo,
  busy = false,
  isDemo = false,
}: RenaissanceHeaderProps) {
  const tabs: Array<{ id: NavTab; label: string; icon: typeof CalendarDays }> = [
    { id: 'today', label: 'Today', icon: CalendarDays },
    { id: 'optimize', label: 'Optimize', icon: Route },
    { id: 'india', label: 'India Monitor', icon: MapIcon },
    { id: 'impact', label: 'Impact', icon: BarChart3 },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="renaissance-top-header" role="banner">
      <div className="header-inner">
        <div className="header-brand-wrap" onClick={() => onTabChange('today')} style={{ cursor: 'pointer' }}>
          <Brand />
        </div>

        <nav className="header-nav-desktop" aria-label="Main navigation">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`header-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="header-actions">
          {onDemo && (
            <button
              className={`demo-quick-btn ${isDemo ? 'is-active-demo' : ''}`}
              disabled={busy}
              onClick={onDemo}
              title="Load verified whole-day itinerary in Guntur with real route comparisons"
            >
              <Sparkles size={14} />
              <span>{busy ? 'Loading Demo…' : isDemo ? 'Demo Mode Active' : 'Try Demo Day'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
