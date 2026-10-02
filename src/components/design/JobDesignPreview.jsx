import React from 'react';
import ApplyHeader from '@/components/apply/ApplyHeader';
import { Button } from '@/components/ui/button';

const SAMPLE_JOB = { title: 'Barista / All rounder', position: 'Crew', hourly_rate: 28 };
const SAMPLE_BRANCH = { name: 'Mascot', suburb: 'Mascot' };

// A miniature of what an applicant sees on the online application page.
export default function JobDesignPreview({ design, companyName }) {
  const brand = design.brand_color || '#4338ca';

  return (
    <div className="overflow-hidden rounded-2xl border bg-slate-50 shadow-sm">
      <ApplyHeader
        brand={brand}
        logo={design.logo_url}
        companyName={companyName}
        branch={SAMPLE_BRANCH}
        job={SAMPLE_JOB}
      />
      <div className="space-y-4 p-5">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: brand }}
            >
              1
            </span>
            <span className="text-xs font-semibold">About you</span>
          </div>
          <div className="space-y-2">
            <div className="h-8 rounded-md border bg-muted/30" />
            <div className="h-8 rounded-md border bg-muted/30" />
            <div className="h-8 rounded-md border bg-muted/30" />
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: brand }}
            >
              2
            </span>
            <span className="text-xs font-semibold">Work rights &amp; availability</span>
          </div>
          <div className="h-8 rounded-md border bg-muted/30" />
        </div>
        <Button className="w-full" size="sm">
          Submit application
        </Button>
      </div>
    </div>
  );
}