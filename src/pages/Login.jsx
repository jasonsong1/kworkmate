import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { kwLogin } from "@/lib/kwAuthClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function Login() {
  // Two doors. An employee signs in with the ID and password their employer issued, and that is
  // checked by this app itself. The work-email door uses the address the employer keeps on the
  // person's staff record, so the email the login accepts is the one in 직원 관리 > 프로필; an
  // account that has no staff record behind it still opens through the platform as before.
  const { t } = useI18n();
  const [door, setDoor] = useState("employee");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const employeeDoor = door === "employee";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (employeeDoor) {
        await kwLogin(identifier.trim(), password);
        window.location.href = returnTo;
        return;
      }
      try {
        await kwLogin(identifier.trim(), password);
        window.location.href = returnTo;
        return;
      } catch (staffError) {
        // 403 means this address has no staff record carrying an employer-issued password, so it
        // can only be a platform account: that door still opens exactly as it always did.
        if (staffError.status !== 403) throw staffError;
      }
      await base44.auth.loginViaEmailPassword(identifier.trim(), password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.status === 401 || !err.message ? t('login.wrong') : err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchDoor = (next) => {
    setDoor(next);
    setIdentifier("");
    setPassword("");
    setError("");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title={t('login.title')}
      subtitle={employeeDoor ? t('login.subtitleEmployee') : t('login.subtitleWork')}
      footer={employeeDoor ? t('login.footerEmployee') : t('login.footerWork')}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => switchDoor("employee")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t('login.doorEmployee')}
          </button>
          <button
            type="button"
            onClick={() => switchDoor("work")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              !employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t('login.doorWork')}
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identifier">{employeeDoor ? t('login.idLabel') : t('login.emailLabel')}</Label>
          <div className="relative">
            {employeeDoor ? (
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Input
              id="identifier"
              type={employeeDoor ? "text" : "email"}
              autoComplete={employeeDoor ? "username" : "email"}
              autoFocus
              placeholder={employeeDoor ? "BRN-001" : "you@example.com"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
          {!employeeDoor && (
            <p className="text-xs text-muted-foreground">{t('login.emailHint')}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('login.password')}</Label>
            {/* Either door can be reset the same way: the address the employer has on file. */}
            <Link to="/password-reset" className="text-xs text-primary hover:underline">
              {t('login.forgot')}
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('login.loggingIn')}
            </>
          ) : (
            t('login.submit')
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}