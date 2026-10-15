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
  UserCircle2,
  Mail,
  QrCode,
  Clock,
  Sparkles,
  ScrollText
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { cn } from '@/lib/utils';

// 일반 매니저/관리자가 보는 기본 메뉴 (기존과 동일하게 유지)
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
  { to: '/activity-logs', key: 'nav.activityLogs', icon: ScrollText, module: 'activity_logs' },
  { to: '/interview-settings', key: 'nav.interview', icon: Mic, area: 'templates', module: 'interview_settings' },
  { to: '/template-design', key: 'nav.templateDesign', icon: Palette, area: 'templates', module: 'templates' },
  { to: '/settings', key: 'nav.settings', icon: Settings, area: 'company_settings', module: 'settings' }
];

// 슈퍼어드민(단 1명)만을 위한 전 기능 메뉴: 빠져 있던 이메일 템플릿, 공고 디자인, QR 디자인, 클락 등 전체 도구 포함
const SUPER_ADMIN_ITEMS = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true, module: 'dashboard' },
  { to: '/branches', key: 'nav.branches', icon: Store, module: 'branches' },
  { to: '/employees', key: 'nav.employees', icon: Users, module: 'employees' },
  { to: '/jobs', key: 'nav.jobs', icon: Briefcase, module: 'jobs' },
  { to: '/applicants', key: 'nav.applicants', icon: UserSearch, module: 'applicants' },
  { to: '/interviews', key: 'nav.interviews', icon: CalendarClock, module: 'interviews' },
  { to: '/roster', key: 'nav.roster', icon: CalendarDays, module: 'roster' },
  { to: '/leave', key: 'nav.leave', icon: CalendarPlus, module: 'leave' },
  { to: '/attendance', key: 'nav.attendance', icon: Timer, module: 'attendance' },
  { to: '/activity-logs', key: 'nav.activityLogs', icon: ScrollText, module: 'activity_logs' },
  // 기존에 메뉴에서 누락되었거나 가려져 있던 고급 디자인 & 제어 도구들
  { to: '/interview-settings', key: 'nav.interview', icon: Mic, module: 'interview_settings' },
  { to: '/email-templates', key: 'nav.emailTemplates', icon: Mail, module: 'templates' },
  { to: '/job-design', key: 'nav.jobDesign', icon: Sparkles, module: 'templates' },
  { to: '/qr-design', key: 'nav.qrDesign', icon: QrCode, module: 'attendance' },
  { to: '/clock', key: 'nav.clock', icon: Clock, module: 'attendance' },
  { to: '/template-design', key: 'nav.templateDesign', icon: Palette, module: 'templates' },
  { to: '/settings', key: 'nav.settings', icon: Settings, module: 'settings' }
];

// Everyone's own space: their shifts, their hours, their clock-in and their own record.
const MY_SPACE_ITEM = { to: '/my-space', key: 'nav.mySpace', icon: UserCircle2, module: 'dashboard' };

const STAFF_ITEMS = [{ to: '/', key: 'nav.mySpace', icon: UserCircle2, end: true, module: 'dashboard' }];

// Only a super admin (platform admin) ever sees this section.
const PLATFORM_ITEMS = [{ to: '/platform', key: 'nav.platform', icon: ShieldCheck }];

export default function AppSidebar({ onNavigate }) {
  const { t } = useI18n();
  const { isManager, isPlatformAdmin, hasModule } = useWorkspace();

  // [중요 원칙]:
  // 1) 슈퍼어드민(isPlatformAdmin)은 빠진 기능 없이 모든 메뉴 항목(SUPER_ADMIN_ITEMS)을 전부 볼 수 있습니다.
  // 2) 다른 직책(매니저/스태프)은 본래 권한(hasModule 필터링)에 따라 부여된 메뉴만 보도록 기존 규칙을 100% 그대로 유지합니다.
  const allowed = isPlatformAdmin
    ? SUPER_ADMIN_ITEMS
    : MANAGER_ITEMS.filter((item) => hasModule(item.module));

  const items = isPlatformAdmin || isManager
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