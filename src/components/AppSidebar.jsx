import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Store,
  Users,
  Briefcase,
  UserSearch,
  CalendarClock,
  CalendarDays,
  Timer,
  Settings,
  UserCircle2,
  QrCode
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { cn } from '@/lib/utils';

const MANAGER_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/branches', key: 'nav.branches', icon: Store },
  { to: '/employees', key: 'nav.employees', icon: Users },
  { to: '/jobs', key: 'nav.jobs', icon: Briefcase },
  { to: '/applicants', key: 'nav.applicants', icon: UserSearch },
  { to: '/interviews', key: 'nav.interviews', icon: CalendarClock },
  { to: '/roster', key: 'nav.roster', icon: CalendarDays },
  { to: '/attendance', key: 'nav.attendance', icon: Timer },
  { to: '/settings', key: 'nav.settings', icon: Settings }
];

const STAFF_ITEMS = [
  { to: '/', key: 'nav.mySpace', icon: UserCircle2, end: true },
  { to: '/clock', key: 'nav.clock', icon: QrCode }
];

export default function AppSidebar({ onNavigate }) {
  const { t } = useI18n();
  const { isManager } = useWorkspace();
  const items = isManager ? MANAGER_ITEMS : STAFF_ITEMS;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Briefcase className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{t('app.name')}</p>
            <p className="text-[11px] text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}