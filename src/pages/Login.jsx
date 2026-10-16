import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { kwLogin, kwLoginWithGoogle, kwHandleOAuthCallback } from "@/lib/kwAuthClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// 구글 공식 컬러 SVG 로고 컴포넌트
function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function Login() {
  const [door, setDoor] = useState("employee");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [idleNotice, setIdleNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // 30분 유휴로 인한 자동 로그아웃 여부 확인
  useEffect(() => {
    const search = window.location.search || '';
    const wasIdle = search.includes('reason=idle') || sessionStorage.getItem('kw_idle_logout') === 'true';
    if (wasIdle) {
      setIdleNotice(true);
      try {
        sessionStorage.removeItem('kw_idle_logout');
      } catch (_) {}
    }
  }, []);

  // 로그인 후 이동할 목적지 경로 (안전한 상대 경로만 허용)
  const returnTo = safeReturnTo();
  const employeeDoor = door === "employee";

  // 로그인한 유저의 역할에 따라 적절한 첫 화면으로 안내하는 헬퍼 함수
  const resolveTargetUrl = (user) => {
    // returnTo가 비어있거나, 루트(/) 또는 마케팅 페이지(/welcome)인 경우
    if (!returnTo || returnTo === '/' || returnTo.startsWith('/welcome')) {
      // 일반 직원은 '내 공간(/my-space)', 관리자/슈퍼어드민은 '대시보드(/)'로 이동
      if (user && user.app_role === 'staff' && !user.is_platform_admin && user.role !== 'admin') {
        return '/my-space';
      }
      return '/';
    }
    return returnTo;
  };

  // 구글 OAuth 로그인 완료 후 리디렉션 복귀 시 자동 세션 수립 처리
  useEffect(() => {
    const handleOAuthReturn = async () => {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const isOAuthRedirect =
        hash.includes('access_token=') ||
        search.includes('code=') ||
        search.includes('oauth=google');

      if (!isOAuthRedirect) return;

      setGoogleLoading(true);
      setError("");
      try {
        const user = await kwHandleOAuthCallback();
        if (user) {
          // 세션 수립 성공 시 적절한 화면으로 즉시 이동 (절대 /welcome으로 가지 않음)
          window.location.href = resolveTargetUrl(user);
        }
      } catch (err) {
        console.error('Google OAuth Callback error:', err);
        setError(err.message || 'Google 로그인 처리 중 오류가 발생했습니다.');
      } finally {
        setGoogleLoading(false);
      }
    };

    handleOAuthReturn();
  }, [returnTo]);

  // 이메일 / 사원번호 로그인 제출 처리
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (employeeDoor) {
        const res = await kwLogin(identifier.trim(), password);
        window.location.href = resolveTargetUrl(res?.user);
        return;
      }
      try {
        const res = await kwLogin(identifier.trim(), password);
        window.location.href = resolveTargetUrl(res?.user);
        return;
      } catch (staffError) {
        if (staffError.status !== 403) throw staffError;
      }
      await base44.auth.loginViaEmailPassword(identifier.trim(), password);
      const me = await base44.auth.me().catch(() => null);
      window.location.href = resolveTargetUrl(me);
    } catch (err) {
      setError(err.status === 401 || !err.message ? 'Invalid ID or password.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  // 구글 SSO 로그인 버튼 클릭 핸들러
  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await kwLoginWithGoogle(returnTo);
    } catch (err) {
      console.error('Google Login error:', err);
      setError(err.message || 'Failed to start Google sign in.');
      setGoogleLoading(false);
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
      title="Sign In"
      subtitle={
        employeeDoor
          ? "Sign in with your employee number and password."
          : "Sign in with your company email address."
      }
      footer={
        employeeDoor
          ? "Contact your manager if you forgot your employee ID."
          : "Sign in to access your company workspace."
      }
    >
      {idleNotice && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>30분 동안 활동이 없어 보안을 위해 자동 로그아웃되었습니다.</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      {/* [Google 간편 로그인 버튼]: 최상단에 눈에 띄게 배치 */}
      <div className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 flex items-center justify-center gap-3 text-sm font-medium border-border hover:bg-muted/60 transition-all shadow-sm"
          onClick={handleGoogleLogin}
          disabled={loading || googleLoading}
        >
          {googleLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span>Connecting Google account...</span>
            </>
          ) : (
            <>
              <GoogleIcon className="w-5 h-5" />
              <span>Continue with Google</span>
            </>
          )}
        </Button>

        {/* 구분선 */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-3 text-muted-foreground font-medium">
              or sign in with credentials
            </span>
          </div>
        </div>

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
              Employee ID
            </button>
            <button
              type="button"
              onClick={() => switchDoor("work")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                !employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              Work Email
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="identifier">
              {employeeDoor ? "Employee ID" : "Work Email Address"}
            </Label>
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
                placeholder={employeeDoor ? "e.g. SMA-001" : "you@example.com"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/password-reset" className="text-xs text-primary hover:underline">
                Forgot password?
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

          <Button type="submit" className="w-full h-12 font-medium" disabled={loading || googleLoading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}