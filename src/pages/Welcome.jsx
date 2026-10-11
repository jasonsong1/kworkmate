import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { demoText } from '@/lib/demoText';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { PlayCircle } from 'lucide-react';
import WelcomeHero from '@/components/welcome/WelcomeHero';
import WelcomeFeatures from '@/components/welcome/WelcomeFeatures';
import WelcomeSteps from '@/components/welcome/WelcomeSteps';

export default function Welcome() {
  const { lang, toggle } = useI18n();
  const c = demoText(lang);

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