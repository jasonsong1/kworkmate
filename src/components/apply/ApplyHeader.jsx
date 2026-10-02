import React from 'react';
import { MapPin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { money } from '@/lib/bh';

// The branded banner at the top of the online application page.
export default function ApplyHeader({ brand, logo, companyName, branch, job }) {
  return (
    <header className="px-4 pb-8 pt-8 text-white" style={{ backgroundColor: brand }}>
      <div className="mx-auto max-w-xl">
        {logo ? (
          <div className="mb-4 inline-flex max-h-16 items-center rounded-xl bg-white/95 px-3 py-2">
            <Image src={logo} alt="Logo" fittingType="fit" className="h-10 w-auto max-w-[180px]" />
          </div>
        ) : null}
        <p className="text-xs uppercase tracking-widest opacity-80">
          {companyName || ''} {branch ? `· ${branch.name}` : ''}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{job.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-90">
          <span>{job.position || 'Team member'}</span>
          {job.hourly_rate ? <span>{money(job.hourly_rate)}/hr</span> : null}
          {branch && (branch.suburb || branch.address) ? (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {branch.suburb || branch.address}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}