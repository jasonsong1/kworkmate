import React, { useEffect, useState } from 'react';
import { Loader2, Search, ShieldCheck, ShieldMinus, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function PlatformAdminManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { me, reload } = useWorkspace();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [confirm, setConfirm] = useState(null);

  // Searching happens on the server so this keeps working with any number of users.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const response = await base44.functions.invoke('managePlatformAdmin', {
        action: 'search',
        query: query.trim()
      });
      if (cancelled) return;
      setRows(response.data?.users || []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const change = async (user, action) => {
    setBusyId(user.id);
    const response = await base44.functions.invoke('managePlatformAdmin', { action, user_id: user.id });
    setBusyId('');
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    const role = response.data.role;
    setRows((prev) => prev.map((item) => (item.id === user.id ? { ...item, role } : item)));
    toast({ title: action === 'grant' ? t('platform.granted') : t('platform.revoked') });
    if (me && me.id === user.id) reload();
  };

  // Removing an account takes the person off the platform altogether, so it is confirmed first.
  const remove = async (user) => {
    setBusyId(user.id);
    const response = await base44.functions.invoke('managePlatformAdmin', { action: 'delete', user_id: user.id });
    setBusyId('');
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    setConfirm(null);
    setRows((prev) => prev.filter((item) => item.id !== user.id));
    toast({ title: t('platform.deleted') });
  };

  return (
    <>
    <Card>
      <CardContent className="p-4">
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('platform.search')}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('platform.empty')}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((user) => {
              const isSuper = user.role === 'admin';
              const isMe = Boolean(me && me.id === user.id);
              return (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{user.full_name || user.email}</span>
                      {isSuper && (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                          <ShieldCheck className="mr-1 h-3 w-3" /> {t('platform.superAdmin')}
                        </Badge>
                      )}
                      {isMe && <span className="text-xs text-muted-foreground">({t('platform.you')})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={isSuper ? 'outline' : 'default'}
                    disabled={busyId === user.id || isMe}
                    onClick={() => change(user, isSuper ? 'revoke' : 'grant')}
                  >
                    {busyId === user.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : isSuper ? (
                      <ShieldMinus className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isSuper ? t('platform.revoke') : t('platform.grant')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('common.delete')}
                    disabled={busyId === user.id || isMe}
                    onClick={() => setConfirm(user)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('platform.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('platform.deleteHint').replace(
                '{name}',
                (confirm && (confirm.full_name || confirm.email)) || ''
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove(confirm)} disabled={busyId === (confirm && confirm.id)}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}