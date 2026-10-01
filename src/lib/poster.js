export function loadImage(url, useCors = true) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function qrImageUrl(text, size = 420) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(text)}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderPoster(canvas, { title, storeName, rate, address, applyUrl, brandColor, logoUrl, note }) {
  const W = 1100;
  const H = 1500;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const color = brandColor || '#4338ca';
  const qrSize = 460;

  const [qr, logo] = await Promise.all([loadImage(qrImageUrl(applyUrl, qrSize)), loadImage(logoUrl)]);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 300);

  if (logo) {
    try {
      ctx.drawImage(logo, 70, 70, 160, 160);
    } catch (error) {
      console.error('logo draw failed', error);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = '600 34px Inter, Arial, sans-serif';
  ctx.fillText(storeName || '', logo ? 260 : 70, 118);

  ctx.font = '800 62px Inter, Arial, sans-serif';
  ctx.fillText("WE'RE HIRING", logo ? 260 : 70, 205);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 66px Inter, Arial, sans-serif';
  const titleLines = String(title || 'Team member').toUpperCase().match(/.{1,22}(\s|$)/g) || [];
  let y = 430;
  titleLines.slice(0, 2).forEach((line) => {
    ctx.fillText(line.trim(), 70, y);
    y += 80;
  });

  if (rate) {
    roundRect(ctx, 70, y + 10, 320, 86, 22);
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 42px Inter, Arial, sans-serif';
    ctx.fillText(rate, 100, y + 54);
    y += 120;
  }

  ctx.fillStyle = '#475569';
  ctx.font = '400 32px Inter, Arial, sans-serif';
  if (address) {
    ctx.fillText(address.slice(0, 46), 70, y + 60);
    y += 50;
  }
  if (note) {
    ctx.fillText(note.slice(0, 46), 70, y + 60);
  }

  const qrX = W - qrSize - 90;
  const qrY = H - qrSize - 320;

  ctx.fillStyle = '#f1f5f9';
  roundRect(ctx, qrX - 44, qrY - 44, qrSize + 88, qrSize + 88, 32);
  ctx.fill();

  if (qr) {
    try {
      ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    } catch (error) {
      console.error('qr draw failed', error);
    }
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 24px Inter, Arial, sans-serif';
    ctx.fillText('QR unavailable', qrX + 60, qrY + qrSize / 2);
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 46px Inter, Arial, sans-serif';
  ctx.fillText('SCAN TO APPLY', 70, H - 250);
  ctx.fillStyle = '#475569';
  ctx.font = '400 28px Inter, Arial, sans-serif';
  ctx.fillText('Takes about 1 minute — no login needed', 70, H - 195);

  ctx.fillStyle = color;
  ctx.font = '400 24px Inter, Arial, sans-serif';
  ctx.fillText(applyUrl.length > 60 ? `${applyUrl.slice(0, 60)}…` : applyUrl, 70, H - 130);

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, H - 60, W, 12);

  return true;
}

export function downloadPng(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename || 'poster.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function downloadPdfFromCanvas(canvas, filename) {
  const { jsPDF } = await import('jspdf');
  const width = 210;
  const height = Math.round((canvas.height / canvas.width) * width);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, height] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
  pdf.save(filename || 'poster.pdf');
}