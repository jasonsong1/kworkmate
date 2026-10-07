import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { passwordProblem } from '@/lib/password';

// Where the employer hands over the sign-in itself. Nothing is emailed: they choose the ID,
// set the password, and the employee can use it straight away.
export default function EmployeeLoginDialog({ open, onOpenChange, employee, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    setLoginId(employee.login_id || employee.employee_number || employee.user_email || '');
    setPassword('');
    setConfirm('');
    setError('');
  }, [open, employee]);

  // The refusals the server names with a code are the ones this screen has its own words for;
  // anything else is shown exactly as it came back. A refusal can arrive either way — as a
  // failed request or as an error in the answer — and either way the button stops turning.
  const REFUSALS = { password_reused: 'password.reused' };
  const explain = (said) =>
    said && REFUSALS[said] ? t(REFUSALS[said]) : said || t('employees.passwordFailed');

  const send = async (body) => {
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('kwSetEmployeePassword', body);
      const data = response.data || {};
      if (data.error) {
        setError(explain(data.error));
        return null;
      }
      onSaved && onSaved();
      onOpenChange(false);
      return data;
    } catch (error) {
      const said =
        (error && error.response && error.response.data && error.response.data.error) ||
        (error && error.message) ||
        '';
      setError(explain(said));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const issue = async () => {
    const problem = passwordProblem(password);
    if (problem) {
      setError(t(`password.${problem}`));
      return;
    }
    if (password !== confirm) {
      setError(t('employees.passwordMismatch'));
      return;
    }
    const done = await send({ profile_id: employee.id, login_id: loginId, password });
    if (done) toast({ title: t('employees.passwordDone') });
  };

  const turnOff = async () => {
    const done = await send({ profile_id: employee.id, action: 'clear' });
    if (done) toast({ title: t('employees.passwordCleared') });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> {t('employees.loginAccess')}
          </DialogTitle>
          <DialogDescription>{t('employees.loginSubtitle')}</DialogDescription>
        </DialogHeader>

        {employee && (
          <p className="text-sm text-muted-foreground">
            {employee.full_name} · {employee.user_email || t('employees.noEmailOnFile')}
          </p>
        )}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="kw-login-id">{t('employees.loginId')}</Label>
            <Input
              id="kw-login-id"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="BRN-001"
            />
            <p className="text-xs text-muted-foreground">{t('employees.loginIdHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kw-password">{t('employees.password')}</Label>
            <Input
              id="kw-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground">{t('password.rule')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="kw-password-confirm">{t('employees.passwordConfirm')}</Label>
            <Input
              id="kw-password-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t('employees.loginManagerNote')}</p>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {employee && employee.password_set && (
            <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={turnOff} disabled={busy}>
              {t('employees.passwordClear')}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={issue} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {employee && employee.password_set ? t('employees.passwordChange') : t('employees.passwordIssue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}