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
  CalendarPlus,
  Timer,
  Settings,
  Mic,
  Palette,
  UserCircle2
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { cn } from '@/lib/utils';

const MANAGER_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { to: '/branches', key: 'nav.branches', icon: Store, area: 'branch_settings', module: 'branches' },
  { to: '/employees', key: 'nav.employees', icon: Users, area: 'employees', module: 'employees' },
  { to: '/jobs', key: 'nav.jobs', icon: Briefcase, area: 'jobs', module: 'jobs' },
  { to: '/applicants', key: 'nav.applicants', icon: UserSearch, area: 'jobs', module: 'applicants' },
  { to: '/interviews', key: 'nav.interviews', icon: CalendarClock, area: 'jobs', module: 'interviews' },
  { to: '/roster', key: 'nav.roster', icon: CalendarDays, area: 'roster', module: 'roster' },
  { to: '/leave', key: 'nav.leave', icon: CalendarPlus, area: 'leave', module: 'leave' },
  { to: '/attendance', key: 'nav.attendance', icon: Timer, area: 'attendance', module: 'attendance' },
  { to: '/interview-settings', key: 'nav.interview', icon: Mic, area: 'templates', module: 'interview_settings' },
  { to: '/template-design', key: 'nav.templateDesign', icon: Palette, area: 'templates', module: 'templates' },
  { to: '/settings', key: 'nav.settings', icon: Settings, area: 'company_settings', module: 'settings' }
];

// Everyone's own space: their shifts, their hours, their clock-in and their own record. The crew
// lands on it straight after sign-in; a manager opens it from beside the manager screens, because
// a manager works shifts too.
const MY_SPACE_ITEM = { to: '/my-space', key: 'nav.mySpace', icon: UserCircle2, module: 'dashboard' };

const STAFF_ITEMS = [{ to: '/', key: 'nav.mySpace', icon: UserCircle2, end: true, module: 'dashboard' }];

// Only a super admin (platform admin) ever sees this section.
const PLATFORM_ITEMS = [{ to: '/platform', key: 'nav.platform', icon: ShieldCheck }];

export default function AppSidebar({ onNavigate }) {
  const { t } = useI18n();
  const { isManager, isPlatformAdmin, hasModule } = useWorkspace();
  // The menu is exactly what the server resolved for this person: the package the company
  // paid for, the preset of their position, and the grant their employer saved. Anything
  // outside that is not shown at all.
  const allowed = MANAGER_ITEMS.filter((item) => hasModule(item.module));
  const items = isManager
    ? allowed.flatMap((item) => (item.end ? [item, MY_SPACE_ITEM] : [item]))
    : [
        ...STAFF_ITEMS.filter((item) => item.to === '/' || hasModule(item.module)),
        ...allowed.filter((item) => item.to !== '/')
      ];
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