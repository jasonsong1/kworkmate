import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';

const FRAME_INTERVAL_MS = 350;

// Opens the phone camera and looks for the store QR code, handing the decoded text to the caller.
export default function QrScannerDialog({ open, onOpenChange, onScan }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const scanRef = useRef(onScan);
  const [error, setError] = useState('');

  useEffect(() => {
    scanRef.current = onScan;
  });

  useEffect(() => {
    if (!open) return undefined;
    setError('');

    let stream = null;
    let timer = null;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const decode = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      const scale = Math.min(1, 480 / width);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
      if (!code || !code.data) return;
      clearInterval(timer);
      timer = null;
      scanRef.current(code.data);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (err) {
        setError(t('clock.scanCameraDenied'));
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      timer = window.setInterval(decode, FRAME_INTERVAL_MS);
    };

    start();

    return () => {
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('clock.scanTitle')}</DialogTitle>
          <DialogDescription>{t('clock.scanHint')}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} autoPlay playsInline muted className="h-64 w-full object-cover" />
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('clock.scanStarting')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}