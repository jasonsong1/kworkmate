import React, { useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

// The weekly round goes to everyone; this sends the same request to just one person.
export default function AvailabilityRequestDialog({ open, onOpenChange, employees, branch, onSent }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState('');
  const [sending, setSending] = useState(false);

  const matches = employees
    .filter((employee) => employee.user_email)
    .filter((employee) => {
      const term = query.trim().toLowerCase();
      if (!term) return true;
      return (
        String(employee.full_name || '').toLowerCase().includes(term) ||
        String(employee.employee_number || '').toLowerCase().includes(term)
      );
    })
    .slice(0, 12);

  const send = async () => {
    if (!picked || !branch) return;
    setSending(true);
    // A refusal from the server — as much as a request that never arrives — puts the button back
    // instead of leaving the window saying "sending" for ever.
    try {
      const response = await base44.functions.invoke('requestAvailability', {
        branch_id: branch.id,
        employee_email: picked,
        origin: window.location.origin
      });
      if (response.data?.error) {
        toast({ title: response.data.error, variant: 'destructive' });
        return;
      }
      onOpenChange(false);
      setQuery('');
      setPicked('');
      toast({ title: t('roster.requestSent') });
      if (onSent) onSent();
    } catch (error) {
      toast({ title: (error && error.message) || t('roster.requestFailed'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('roster.requestOneTitle')}</DialogTitle>
          <DialogDescription>{branch ? branch.name : ''}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.search')}
            className="pl-9"
          />
        </div>

        <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t('common.none')}</p>
          ) : (
            matches.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => setPicked(employee.user_email)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  picked === employee.user_email ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                }`}
              >
                <span className="min-w-0">
                  <span className="font-medium">{employee.full_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {[employee.employee_number, employee.position].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} disabled={!picked || sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {t('common.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}