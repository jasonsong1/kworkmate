import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  Store,
  Users,
  Briefcase,
  UserSearch,
  CalendarClock,
  CalendarDays,
  Timer,
  Settings,
  Mic,
  Palette,
  UserCircle2,
  QrCode
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const MANAGER_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/branches', key: 'nav.branches', icon: Store, area: 'branch_settings' },
  { to: '/employees', key: 'nav.employees', icon: Users, area: 'employees' },
  { to: '/jobs', key: 'nav.jobs', icon: Briefcase, area: 'jobs' },
  { to: '/applicants', key: 'nav.applicants', icon: UserSearch, area: 'jobs' },
  { to: '/interviews', key: 'nav.interviews', icon: CalendarClock, area: 'jobs' },
  { to: '/roster', key: 'nav.roster', icon: CalendarDays, area: 'roster' },
  { to: '/attendance', key: 'nav.attendance', icon: Timer, area: 'attendance' },
  { to: '/interview-settings', key: 'nav.interview', icon: Mic, area: 'templates' },
  { to: '/template-design', key: 'nav.templateDesign', icon: Palette, area: 'templates' },
  { to: '/settings', key: 'nav.settings', icon: Settings, area: 'company_settings' }
];

const STAFF_ITEMS = [
  { to: '/', key: 'nav.mySpace', icon: UserCircle2, end: true },
  { to: '/clock', key: 'nav.clock', icon: QrCode, area: 'attendance' }
];

// Only a super admin (platform admin) ever sees this section.
const PLATFORM_ITEMS = [{ to: '/platform', key: 'nav.platform', icon: ShieldCheck }];

export default function AppSidebar({ onNavigate }) {
  const { t } = useI18n();
  const { isManager, isPlatformAdmin } = useWorkspace();
  const { canView, canEdit } = usePermissions();
  // Roster and attendance are visible to every employee, so those two only open the
  // back office menu when a role actually manages them; the rest follow "can see".
  const MANAGES = ['roster', 'attendance'];
  const granted = (area) => (MANAGES.includes(area) ? canEdit(area) : canView(area));
  const items = isManager
    ? MANAGER_ITEMS.filter((item) => !item.area || canView(item.area))
    : [...STAFF_ITEMS, ...MANAGER_ITEMS.filter((item) => item.area && granted(item.area))];
  const linkClass = ({ isActive }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    );

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
            className={linkClass}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {t(item.key)}
          </NavLink>
        ))}
      </nav>

      {isPlatformAdmin && (
        <div className="border-t px-3 py-3">
          {PLATFORM_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className={linkClass}>
              <item.icon className="h-4 w-4 shrink-0" />
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}