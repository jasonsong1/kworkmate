import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { passwordProblem } from '@/lib/password';
import { base44 } from '@/api/base44Client';

// Your own sign-in password. Holding a session is enough to set a new one, so nothing has to be
// emailed and nobody has to ask their manager.
export default function SelfPasswordDialog({ open, onOpenChange, profile }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirm('');
    setError('');
  }, [open]);

  const save = async () => {
    if (!profile) return;
    const problem = passwordProblem(password);
    if (problem) {
      setError(t(`password.${problem}`));
      return;
    }
    if (password !== confirm) {
      setError(t('employees.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('kwSetEmployeePassword', {
        profile_id: profile.id,
        login_id: profile.login_id || profile.user_email,
        password
      });
      const data = response.data || {};
      if (data.error) {
        setError(data.error === 'password_reused' ? t('password.reused') : data.error);
        return;
      }
      toast({ title: t('employees.passwordDone') });
      onOpenChange(false);
    } catch (err) {
      const said = (err && err.response && err.response.data && err.response.data.error) || (err && err.message) || '';
      setError(said === 'password_reused' ? t('password.reused') : said || t('employees.passwordFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('staff.resetPassword')}</DialogTitle>
          <DialogDescription>{t('staff.resetPasswordHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('employees.password')}</Label>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label>{t('employees.passwordConfirm')}</Label>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t('password.rule')}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={busy || !password || !confirm}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}