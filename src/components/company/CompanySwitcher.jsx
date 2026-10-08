import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default function CompanySwitcher() {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { company, switchCompany } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [switchingId, setSwitchingId] = useState('');

  // Searching happens on the server, so this keeps working with any number of companies.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const term = query.trim();
      // A deactivated company is not offered: it comes back to the list the moment it is
      // switched back on in platform management.
      const filter = term
        ? { name: { $regex: escapeRegex(term), $options: 'i' }, deactivated: { $ne: true } }
        : { deactivated: { $ne: true } };
      const page = await base44.entities.Company.filter(filter, { sort: 'name', limit: 20 });
      if (cancelled) return;
      setResults(page.items || []);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const choose = async (item) => {
    if (company && item.id === company.id) {
      setOpen(false);
      return;
    }
    setSwitchingId(item.id);
    try {
      await switchCompany(item.id);
      setOpen(false);
      navigate('/');
      toast({ title: t('company.switched').replace('{name}', item.name) });
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setSwitchingId('');
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-44 justify-between sm:w-56">
            <span className="flex min-w-0 items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{company ? company.name : t('company.switch')}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={t('company.search')} />
            <CommandList>
              {searching ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('company.none')}</p>
              ) : (
                <CommandGroup>
                  {results.map((item) => (
                    <CommandItem key={item.id} value={item.id} onSelect={() => choose(item)}>
                      <span className="flex-1 truncate">{item.name}</span>
                      {switchingId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        company && company.id === item.id && <Check className="h-3.5 w-3.5" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}