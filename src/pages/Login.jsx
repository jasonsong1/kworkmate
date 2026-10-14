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
  const { t, lang } = useI18n();
  const [door, setDoor] = useState("employee");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // 로그인 후 이동할 목적지 경로 (안전한 상대 경로만 허용)
  const returnTo = safeReturnTo();
  const employeeDoor = door === "employee";

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
          // 세션 수립 성공 시 원래 이동하려던 페이지로 즉시 이동
          window.location.href = returnTo;
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
        await kwLogin(identifier.trim(), password);
        window.location.href = returnTo;
        return;
      }
      try {
        await kwLogin(identifier.trim(), password);
        window.location.href = returnTo;
        return;
      } catch (staffError) {
        if (staffError.status !== 403) throw staffError;
      }
      await base44.auth.loginViaEmailPassword(identifier.trim(), password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.status === 401 || !err.message ? (lang === 'ko' ? '아이디 또는 비밀번호가 일치하지 않습니다.' : 'Invalid ID or password.') : err.message);
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
      setError(err.message || (lang === 'ko' ? 'Google 로그인을 시작하지 못했습니다.' : 'Failed to start Google sign in.'));
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
      title={lang === 'ko' ? '로그인' : 'Sign in'}
      subtitle={
        employeeDoor
          ? (lang === 'ko' ? '사원번호와 비밀번호로 로그인합니다.' : 'Sign in with your employee number and password.')
          : (lang === 'ko' ? '회사 업무용 이메일로 로그인합니다.' : 'Sign in with your company email address.')
      }
      footer={
        employeeDoor
          ? (lang === 'ko' ? '사원번호 분실 시 매니저에게 문의하세요.' : 'Contact your manager if you forgot your employee ID.')
          : (lang === 'ko' ? '회사 관리자 계정으로 로그인합니다.' : 'Sign in to access your company workspace.')
      }
    >
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
              <span>{lang === 'ko' ? 'Google 계정 연결 중...' : 'Connecting Google account...'}</span>
            </>
          ) : (
            <>
              <GoogleIcon className="w-5 h-5" />
              <span>{lang === 'ko' ? 'Google 계정으로 계속하기' : 'Continue with Google'}</span>
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
              {lang === 'ko' ? '또는 기존 계정으로 로그인' : 'or sign in with credentials'}
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
              {lang === 'ko' ? '사원번호 로그인' : 'Employee ID'}
            </button>
            <button
              type="button"
              onClick={() => switchDoor("work")}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                !employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {lang === 'ko' ? '업무 이메일' : 'Work Email'}
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="identifier">
              {employeeDoor
                ? (lang === 'ko' ? '사원번호' : 'Employee ID')
                : (lang === 'ko' ? '이메일 주소' : 'Email Address')}
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
                placeholder={employeeDoor ? "QAB-001" : "you@example.com"}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{lang === 'ko' ? '비밀번호' : 'Password'}</Label>
              <Link to="/password-reset" className="text-xs text-primary hover:underline">
                {lang === 'ko' ? '비밀번호 재설정' : 'Forgot password?'}
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
                {lang === 'ko' ? '로그인 중...' : 'Signing in...'}
              </>
            ) : (
              lang === 'ko' ? '로그인' : 'Sign In'
            )}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}