import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/bh';
import { base44 } from '@/api/base44Client';
import { kwActive, kwCall, kwIdentity } from '@/lib/kwAuthClient';
import { useWorkspace } from '@/lib/WorkspaceContext';
import OnboardingStatusList from '@/components/employee/OnboardingStatusList';
import OnboardingDetails from '@/components/employee/OnboardingDetails';

export default function EmployeeDocumentsDialog({ open, onOpenChange, employee }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setDocs((employee && employee.docs) || []);
  }, [employee]);

  // A signed-in employee holds this app's own session rather than a platform one, so their own
  // staff record is what signs the file — and only a file that record already carries is ever
  // signed. The employer's own screen keeps the platform's own signing.
  const identity = kwIdentity();
  const viaOwnRecord = Boolean(kwActive() && identity && employee && identity.email === employee.user_email);

  const openDoc = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setLoadingId(doc.file_uri);
    try {
      const signed = viaOwnRecord
        ? await kwCall('kwSession', { action: 'sign_document', file_uri: doc.file_uri })
        : await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri });
      if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
    } catch (error) {
      toast({ title: error.message || t('employees.docOpenFailed'), variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  // Their own file, filed by themselves: the employer sees it on the same record.
  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const saved = await kwCall('kwSession', { action: 'add_document', file_uri, name: file.name });
      setDocs((saved && saved.docs) || docs);
      toast({ title: t('employees.docUploaded') });
    } catch (error) {
      toast({ title: error.message || t('employees.docUploadFailed'), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // A file the employee filed themselves is theirs to remove; what the employer or the
  // onboarding run put on the record stays.
  const remove = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setRemovingId(doc.file_uri);
    try {
      const saved = await kwCall('kwSession', { action: 'delete_document', file_uri: doc.file_uri });
      setDocs((saved && saved.docs) || docs.filter((item) => item.file_uri !== doc.file_uri));
      toast({ title: t('employees.docDeleted') });
    } catch (error) {
      toast({ title: error.message || t('employees.docDeleteFailed'), variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('employees.vault')} — {employee ? employee.full_name : ''}
          </DialogTitle>
        </DialogHeader>

        {/* An employee files their own documents here; the employer's copy of this screen does
            not offer it. */}
        {viaOwnRecord && (
          <div className="flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('employees.docUploadHint')}</p>
            <Button
              size="sm"
              onClick={() => fileRef.current && fileRef.current.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Upload className="mr-2 h-3.5 w-3.5" /> {t('common.upload')}
                </>
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              onChange={upload}
            />
          </div>
        )}

        {/* What their employer asks a new hire for, and what has arrived. */}
        {employee && company && (
          <OnboardingStatusList
            profile={employee}
            company={company}
            onOpen={openDoc}
            loadingUri={loadingId}
          />
        )}

        {employee && <OnboardingDetails profile={employee} company={company} />}

        {docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('employees.noDocs')}</p>
        ) : (
          <div className="w-full divide-y rounded-lg border">
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
                {viaOwnRecord && (doc.uploaded_by === 'self' || doc.type === 'staff_upload') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(doc)}
                    disabled={removingId === doc.file_uri}
                    title={t('common.delete')}
                  >
                    {removingId === doc.file_uri ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}