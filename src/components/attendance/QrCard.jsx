import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

// The stored clock-in QR design, drawn the same way on the back-office screen and on the
// store kiosk. Text is passed in rather than translated here, because the store screen is
// always English.
export default function QrCard({ url, design, fallbackTitle, fallbackNote, noteClassName = 'text-muted-foreground' }) {
  const saved = design || {};
  const color = saved.brand_color || '#111111';
  const size = Math.min(320, Math.max(160, Number(saved.size) || 240));
  const title = saved.title || fallbackTitle;
  const note = saved.note || fallbackNote;
  const logo = saved.logo_url;

  return (
    <div className="text-center">
      {logo ? (
        <div className="mx-auto mb-4 flex h-14 max-w-[200px] items-center justify-center overflow-hidden">
          <img
            src={logo}
            alt="Logo"
            className="max-h-full max-w-full object-contain"
            style={{ objectFit: 'contain' }}
          />
        </div>
      ) : null}
      {title ? (
        <p className="text-sm font-semibold" style={{ color }}>
          {title}
        </p>
      ) : null}
      <div className="mt-3 flex justify-center rounded-2xl border p-3" style={{ borderColor: color }}>
        <QRCodeSVG value={url} size={size} level="M" marginSize={4} />
      </div>
      {note ? <p className={`mt-3 text-xs ${noteClassName}`}>{note}</p> : null}
    </div>
  );
}