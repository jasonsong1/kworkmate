import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/lib/i18n';

// Emptying a week takes every shift off it, drafts and sent shifts alike, so it always asks
// first and names the week it is about to clear.
export default function ClearRosterDialog({ open, onOpenChange, weekStart, weekEnd, clearing, onConfirm }) {
  const { t } = useI18n();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('roster.clearTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('roster.clearHint').replace('{week}', `${weekStart} → ${weekEnd}`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // The dialog stays open with its spinner until the week is actually empty.
              event.preventDefault();
              onConfirm();
            }}
            disabled={clearing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {t('roster.clearConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}