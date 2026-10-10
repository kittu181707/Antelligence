import { CalendarDays, Map as MapIcon, Settings } from 'lucide-react';

// The public navigation stays focused: plan a day, see the route, set preferences.
// Other completed workflows remain within Today rather than cluttering the dock.
export type NavTab = 'today' | 'map' | 'optimize' | 'impact' | 'india' | 'history' | 'settings';

export function BottomNav({ active, onChange }: { active: NavTab; onChange: (tab: NavTab) => void }) {
  const items = [
    ['today', 'Today', CalendarDays],
    ['map', 'Map', MapIcon],
    ['settings', 'Settings', Settings],
  ] as const;
  return <nav className="bottom-nav" aria-label="Primary navigation">
    {items.map(([value, label, Icon]) => <button type="button" key={value} className={active === value ? 'active' : ''}
      aria-current={active === value ? 'page' : undefined}
      onClick={() => onChange(value)}>
      <Icon size={20} aria-hidden="true"/><span>{label}</span>
    </button>)}
  </nav>;
}
