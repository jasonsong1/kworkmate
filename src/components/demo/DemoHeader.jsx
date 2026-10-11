import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Lock, X } from 'lucide-react';

export default function DemoHeader({ c }) {
  const { lang, toggle } = useI18n();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-5 py-3">
        <Link to="/welcome" className="font-heading text-sm font-semibold tracking-tight">
          K-Workmate
        </Link>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {c.top.badge}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:flex">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {c.top.virtual}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={toggle} className="text-xs text-muted-foreground">
            {lang === 'ko' ? 'EN' : '한국어'}
          </Button>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/login">{c.top.login}</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/welcome">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {c.top.exit}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}