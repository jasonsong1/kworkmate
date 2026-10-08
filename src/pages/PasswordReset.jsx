import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, MailCheck, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordProblem } from '@/lib/password';
import { base44 } from '@/api/base44Client';

const PROBLEMS = {
  length: 'Use at least 10 characters.',
  upper: 'Add at least one uppercase letter.',
  lower: 'Add at least one lowercase letter.',
  number: 'Add at least one number.',
  symbol: 'Add at least one symbol.'
};

const explain = (said) =>
  PROBLEMS[said] ||
  (said === 'password_reused' ? 'That password has been used before. Choose a new one.' : said || 'Something went wrong. Please try again.');

// Where a forgotten password is set again: the person types the address their employer has on
// file, and the link in the mail that follows is what lets them choose a new one.
export default function PasswordReset() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [state, setState] = useState(token ? 'checking' : 'asking');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A link that has already been used, or has run out of time, says so before the form is filled.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    base44.functions
      .invoke('completePasswordReset', { action: 'check', token })
      .then((response) => {
        if (cancelled) return;
        const data = response.data || {};
        if (data.error) {
          setState('expired');
          return;
        }
        setName(data.name || '');
        setState('setting');
      })
      .catch(() => {
        if (!cancelled) setState('expired');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ask = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await base44.functions.invoke('requestEmployeePasswordReset', {
        email: email.trim(),
        origin: window.location.origin
      });
    } catch (err) {
      // Whether the address is registered may not show through this form, so even a failed
      // request is answered with the same message.
    } finally {
      setBusy(false);
      setState('sent');
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(explain(problem));
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('completePasswordReset', { token, password });
      const data = response.data || {};
      if (data.error) {
        setError(explain(data.error));
        return;
      }
      setState('done');
    } catch (err) {
      const said = (err && err.response && err.response.data && err.response.data.error) || (err && err.message) || '';
      setError(explain(said));
    } finally {
      setBusy(false);
    }
  };

  const backToLogin = (
    <Link to="/login" className="text-primary hover:underline">
      Back to sign in
    </Link>
  );

  if (state === 'checking') {
    return (
      <AuthLayout icon={KeyRound} title="Checking your link">
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> One moment…
        </p>
      </AuthLayout>
    );
  }

  if (state === 'sent') {
    return (
      <AuthLayout
        icon={MailCheck}
        title="Check your email"
        subtitle="If that address is on our records, a link to set a new password is on its way."
        footer={backToLogin}
      >
        <p className="text-sm text-muted-foreground">
          The link works for one hour and can be used once. Nothing arrives within a few minutes? Ask your
          manager to check the address on your record.
        </p>
      </AuthLayout>
    );
  }

  if (state === 'expired') {
    return (
      <AuthLayout
        icon={KeyRound}
        title="This link has expired"
        subtitle="Links work for one hour and can only be used once."
        footer={backToLogin}
      >
        <Button className="w-full h-12" asChild>
          <Link to="/password-reset">Ask for a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (state === 'done') {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Your new password is ready"
        subtitle="Sign in with your email or employee ID and the password you just chose."
      >
        <Button className="w-full h-12" asChild>
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  if (state === 'setting') {
    return (
      <AuthLayout
        icon={KeyRound}
        title="Choose a new password"
        subtitle={name ? `For ${name}` : 'For your kworkmate sign-in'}
        footer={backToLogin}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="h-12"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Use at least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full h-12" disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save new password
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title="Forgot your password?"
      subtitle="Enter the email address your employer has on file."
      footer={backToLogin}
    >
      <form onSubmit={ask} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full h-12" disabled={busy || !email.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Email me a reset link
        </Button>
      </form>
    </AuthLayout>
  );
}