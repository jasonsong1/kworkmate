import React, { useRef, useState, useEffect } from 'react';
import { PenTool, RotateCcw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

/**
 * 고용주 공식 전자서명(e-Signature) 등록 다이얼로그
 * 호주 국세청(ATO NAT 3092) Section B 고용주 서명란에 인쇄될 서명을 등록합니다.
 */
export default function EmployerSignatureDialog({ open, onOpenChange, initialSignature = '', onSave }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [currentSignature, setCurrentSignature] = useState(initialSignature);

  useEffect(() => {
    setCurrentSignature(initialSignature);
    setHasDrawn(Boolean(initialSignature));
  }, [initialSignature, open]);

  // Canvas 초기화 및 기존 서명 복원
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (initialSignature && initialSignature.startsWith('data:image/')) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialSignature;
    }
  }, [open, initialSignature]);

  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a'; // 선명한 잉크 블랙
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (event) => {
    if (!isDrawing) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setCurrentSignature('');
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <PenTool className="h-5 w-5 text-primary" />
            고용주 공식 전자서명 등록 (ATO NAT 3092)
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            직원이 온보딩을 완료했을 때, 호주 국세청(ATO) 세무 서식 <b>Section B (Declaration by payer: Signature of payer)</b>에 자동으로 날인될 고용주 공식 서명입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white p-1 overflow-hidden shadow-inner">
            <canvas
              ref={canvasRef}
              width={420}
              height={160}
              className="w-full h-40 touch-none cursor-crosshair block bg-white"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            {!hasDrawn && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                마우스나 터치펜으로 이 박스 안에 직접 서명하세요.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>서명 완료 후 [서명 저장]을 누르면 회사 설정에 즉시 등록됩니다.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearCanvas}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> 다시 그리기
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" size="sm" disabled={!hasDrawn} onClick={handleSave}>
            <Check className="mr-1.5 h-4 w-4" /> 서명 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
