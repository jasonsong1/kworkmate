import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const pos = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return {
      x: ((point.clientX - rect.left) / rect.width) * canvas.width,
      y: ((point.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const start = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = pos(event);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = pos(event);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && onChange) onChange(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    if (onChange) onChange('');
  };

  useImperativeHandle(ref, () => ({
    dataUrl: () => (canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''),
    clear
  }));

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed bg-white">
        <canvas
          ref={canvasRef}
          width={800}
          height={320}
          className="h-40 w-full touch-none rounded-xl"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            Sign here with your finger or mouse
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 flex items-center gap-1 text-xs text-slate-500 underline"
      >
        <Eraser className="h-3 w-3" /> Clear signature
      </button>
    </div>
  );
});

export default SignaturePad;