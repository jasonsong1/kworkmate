import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { formatDateTime } from '@/lib/bh';
import { base44 } from '@/api/base44Client';
import NotificationSettingsDialog from '@/components/notifications/NotificationSettingsDialog';

// Everything the app has told this person: leave decisions and roster changes, newest first.
export default function NotificationBell() {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!me || !me.email) return;
    const page = await base44.entities.Notification
      .filter({ user_email: me.email }, { sort: '-created_date', limit: 30 })
      .catch(() => null);
    setItems((page && page.items) || []);
  }, [me]);

  useEffect(() => {
    load();
    // Approvals land while the manager is on another screen, so the bell keeps itself up to
    // date: live where the platform can push the change, and on a slow timer everywhere else.
    let unsubscribe = () => {};
    try {
      const handle = base44.entities.Notification.subscribe((event) => {
        const row = (event && event.data) || {};
        if (!row.user_email || (me && row.user_email === me.email)) load();
      });
      if (typeof handle === 'function') unsubscribe = handle;
    } catch (error) {
      /* live updates are a bonus; the timer below still brings the news */
    }
    const timer = setInterval(load, 60000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [load, me]);

  const unread = items.filter((item) => !item.read).length;

  const markAll = async () => {
    const unreadItems = items.filter((item) => !item.read);
    if (unreadItems.length === 0) return;
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    await base44.entities.Notification.bulkUpdate(unreadItems.map((item) => ({ id: item.id, read: true }))).catch(() => null);
  };

  return (
    <>
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title={t('leave.notifications')}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t('leave.notifications')}</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> {t('leave.markAllRead')}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('leave.noNotifications')}</p>
          ) : (
            items.map((item) => (
              <Link
                key={item.id}
                to={item.link || '/leave'}
                onClick={() => setOpen(false)}
                className={`block border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/60 ${item.read ? '' : 'bg-primary/5'}`}
              >
                <p className="font-medium leading-snug">{item.title}</p>
                {item.body ? <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.created_date)}</p>
              </Link>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setSettingsOpen(true); }}
          className="flex w-full items-center gap-2 border-t bg-muted/40 px-3 py-2 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:bg-muted"
        >
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          <span>{t('leave.pushNote')}</span>
        </button>
      </PopoverContent>
    </Popover>
    <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}