import React, { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/bh';
import { base44 } from '@/api/base44Client';
import { kwActive, kwCall } from '@/lib/kwAuthClient';

export default function EmployeeDocumentsDialog({ open, onOpenChange, employee }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState(null);

  // A signed-in employee holds this app's own session rather than a platform one, so their own
  // staff record is what signs the file — and only a file that record already carries is ever
  // signed. The employer's screen keeps the platform's own signing.
  const openDoc = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setLoadingId(doc.file_uri);
    try {
      const signed = kwActive()
        ? await kwCall('kwSession', { action: 'sign_document', file_uri: doc.file_uri })
        : await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri });
      if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
    } catch (error) {
      toast({ title: error.message || t('employees.docOpenFailed'), variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  const docs = (employee && employee.docs) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('employees.vault')} — {employee ? employee.full_name : ''}
          </DialogTitle>
        </DialogHeader>

        {docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('employees.noDocs')}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {docs.map((doc, index) => (
              <div key={`${doc.file_uri}-${index}`} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name || 'Document'}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(doc.created_at)}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {String(doc.type || 'file').replace(/_/g, ' ')}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDoc(doc)}
                  disabled={loadingId === doc.file_uri}
                >
                  {loadingId === doc.file_uri ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    t('common.open')
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}