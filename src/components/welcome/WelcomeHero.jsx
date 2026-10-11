import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { PlayCircle, ArrowRight } from 'lucide-react';
import DemoPreviewCard from '@/components/welcome/DemoPreviewCard';

export default function WelcomeHero({ c }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-10 pt-6 lg:grid-cols-2 lg:pb-20 lg:pt-12">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
        <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          {c.welcome.badge}
        </span>
        <h1 className="mt-5 font-heading text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {c.welcome.title}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">{c.welcome.lead}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/demo">
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {c.welcome.ctaDemo}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">
              {c.welcome.ctaLogin}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{c.welcome.note}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
      >
        <DemoPreviewCard c={c} />
      </motion.div>
    </section>
  );
}