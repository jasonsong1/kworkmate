import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

// A position preset picker that filters as the employer types, so a long preset list stays usable.
export default function PresetPicker({ value, onChange, options = [], nameOf, placeholder, disabled, className }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = (key) => (nameOf ? nameOf(key) : key);
  const current = value ? label(value) : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-9 w-full justify-between px-3 font-normal', !current && 'text-muted-foreground', className)}
        >
          <span className="truncate">{current || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[15rem] p-0">
        <Command>
          <CommandInput placeholder={t('common.search')} />
          <CommandList>
            <CommandEmpty>{t('common.noResults')}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={label(option)}
                onSelect={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', option === value ? 'opacity-100' : 'opacity-0')} />
                {label(option)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}