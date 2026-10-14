import React from 'react';

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="font-semibold tracking-tight text-foreground text-xl sm:text-2xl truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground truncate">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {actions}
        </div>
      )}
    </div>
  );
}