import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { demoText } from '@/lib/demoText';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';
import WelcomeHero from '@/components/welcome/WelcomeHero';
import WelcomeFeatures from '@/components/welcome/WelcomeFeatures';
import WelcomeSteps from '@/components/welcome/WelcomeSteps';
import { useAuth } from '@/lib/AuthContext';
import { kwActive } from '@/lib/kwAuthClient';

// 소개/랜딩 페이지 컴포넌트:
// 이미 로그인된 사용자가 이 페이지에 접근한 경우, 로그인 밖의 페이지에 머무르지 않고 즉시 대시보드(/)로 자동 이동합니다.
export default function Welcome() {
  const { lang, toggle } = useI18n();
  const c = demoText(lang);
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();

  useEffect(() => {
    // 이미 로그인되어 있거나 세션 토큰이 있으면 대시보드로 자동 이동
    if ((!isLoadingAuth && isAuthenticated) || kwActive()) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate]);

  return (
    <div className="min-h-screen bg-background font-body">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-5">
        <Image
          src="https://media.base44.com/images/public/6abdfea3bcad266c314dcfd3/ca1e30504_logo.png"
          alt="K-Workmate"
          className="h-8 w-8 rounded-lg"
        />
        <span className="font-heading text-base font-semibold tracking-tight">K-Workmate</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={toggle} className="text-xs text-muted-foreground">
            {lang === 'ko' ? 'EN' : '한국어'}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">{c.welcome.ctaLogin}</Link>
          </Button>
        </div>
      </header>

      <WelcomeHero c={c} />
      <WelcomeFeatures c={c} />
      <WelcomeSteps c={c} />

      <section className="mx-auto w-full max-w-6xl px-5 py-16">
        <div className="rounded-3xl border border-border bg-primary/5 px-6 py-12 text-center sm:px-12">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {c.welcome.endTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{c.welcome.endBody}</p>
          <Button asChild size="lg" className="mt-7">
            <Link to="/demo">
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {c.welcome.endCta}
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 text-xs text-muted-foreground">
        {c.welcome.footer}
      </footer>
    </div>
  );
}