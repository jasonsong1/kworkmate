import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Loader2, RotateCcw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ALLOWED_RESUME_EXT, MAX_RESUME_BYTES, fileExtension, formatBytes } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function ResumeUpload({ value, onChange }) {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const ext = fileExtension(file.name);
    if (!ALLOWED_RESUME_EXT.includes(ext)) {
      setError('Only PDF, DOC or DOCX files are accepted.');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError(`This file is ${formatBytes(file.size)}. Maximum allowed size is 10MB.`);
      return;
    }

    setError('');
    setUploading(true);
    setProgress(6);
    const timer = setInterval(() => setProgress((p) => (p < 90 ? p + 6 : p)), 200);

    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      clearInterval(timer);
      setProgress(100);
      onChange({ file_uri, filename: file.name, size: file.size });
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={pick}
      />

      {value && value.file_uri ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.filename}</p>
            <p className="text-xs text-emerald-700">{formatBytes(value.size)} · uploaded</p>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => {
              onChange(null);
              inputRef.current && inputRef.current.click();
            }}
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <FileUp className="h-6 w-6 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {uploading ? 'Uploading your resume…' : 'Upload your resume'}
          </span>
          <span className="text-xs text-muted-foreground">PDF, DOC or DOCX · up to 10MB</span>
        </button>
      )}

      {uploading && (
        <div className="mt-3">
          <Progress value={progress} className="h-2" />
          <p className="mt-1 text-right text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            <button
              type="button"
              className="mt-1 flex items-center gap-1 text-xs font-medium underline"
              onClick={() => inputRef.current && inputRef.current.click()}
            >
              <RotateCcw className="h-3 w-3" /> Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}