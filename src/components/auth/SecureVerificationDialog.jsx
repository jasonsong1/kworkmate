import React, { useState } from 'react';
import { Fingerprint, KeyRound, Loader2, Lock, ShieldCheck, Smartphone } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { kwSessionAction } from '@/lib/kwAuthClient';

/**
 * SecureVerificationDialog 컴포넌트
 * 민감한 온보딩 서류(신분증 등) 및 개인정보 질문 열람을 위해
 * 로그인 비밀번호 또는 얼굴인식(Face ID)/지문인식 본인 확인을 수행하는 모달입니다.
 */
export default function SecureVerificationDialog({
  open,
  onOpenChange,
  onSuccess,
  title,
  description
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  // 브라우저 및 기기의 생체인증(WebAuthn / Face ID / Touch ID) 지원 여부 확인
  const hasBiometrics = typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);

  // 1. 비밀번호 확인 처리
  const handlePasswordSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!password) {
      toast({ variant: 'destructive', title: '비밀번호를 입력해 주세요.' });
      return;
    }

    setBusy(true);
    try {
      const res = await kwSessionAction({
        action: 'verify_password',
        password
      });

      if (res && res.ok) {
        toast({ title: '본인 인증이 완료되었습니다.' });
        setPassword('');
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        throw new Error(res?.error || '비밀번호가 일치하지 않습니다.');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: error?.message || '비밀번호 인증 실패'
      });
    } finally {
      setBusy(false);
    }
  };

  // 2. 모바일/디바이스 얼굴인식(Face ID) 및 지문인식 처리 (WebAuthn)
  const handleBiometricAuth = async () => {
    if (!hasBiometrics) {
      toast({ variant: 'destructive', title: '현재 기기나 브라우저에서 생체인증을 지원하지 않습니다.' });
      return;
    }

    setBiometricBusy(true);
    try {
      // 챌린지 생성
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // 모바일 FaceID/TouchID 또는 Windows Hello 생체인식 요청
      let credential = null;
      try {
        credential = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: 'preferred'
          }
        });
      } catch (err) {
        console.warn('Biometrics call failed or cancelled:', err);
        toast({
          variant: 'destructive',
          title: '인증이 취소되었거나 실패했습니다. 로그인 비밀번호로 인증해 주세요.'
        });
        return; // 취소 시 절대 onSuccess를 실행하지 않고 종료
      }

      // 생체인증이 실제로 성공적으로 서명된 경우에만 열람 허용
      if (credential && credential.id) {
        toast({ title: '얼굴인식(생체인증) 본인 확인이 완료되었습니다.' });
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast({
          variant: 'destructive',
          title: '생체인증을 확인할 수 없습니다. 비밀번호로 인증해 주세요.'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '생체인증에 실패했습니다. 비밀번호로 인증해 주세요.'
      });
    } finally {
      setBiometricBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <Lock className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold">
            {title || t('security.verifyTitle') || '보안 본인 인증'}
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            {description ||
              t('security.verifyDesc') ||
              '민감한 개인정보 및 증빙 서류 보호를 위해 로그인 비밀번호 또는 얼굴인식(생체인증)을 진행해 주세요.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handlePasswordSubmit} className="space-y-4 py-2">
          {/* 모바일 얼굴인식 / 지문인식 버튼 */}
          {hasBiometrics && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 justify-center gap-2 border-primary/30 hover:bg-primary/5 font-medium text-sm text-foreground"
                disabled={biometricBusy || busy}
                onClick={handleBiometricAuth}
              >
                {biometricBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Fingerprint className="h-4 w-4 text-primary" />
                )}
                <span>{t('security.biometrics') || '얼굴인식 (Face ID) / 지문인식으로 인증'}</span>
              </Button>

              <div className="relative my-3 text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-background px-2 text-muted-foreground">
                  또는 비밀번호 입력
                </span>
              </div>
            </div>
          )}

          {/* 비밀번호 입력 필드 */}
          <div className="space-y-2">
            <Label htmlFor="sec-pwd" className="text-xs font-medium flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{t('security.password') || '로그인 비밀번호'}</span>
            </Label>
            <Input
              id="sec-pwd"
              type="password"
              autoComplete="current-password"
              placeholder={t('security.passwordPlaceholder') || '비밀번호를 입력하세요'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || biometricBusy}
              className="h-10 text-sm"
              autoFocus={!hasBiometrics}
            />
          </div>

          <DialogFooter className="mt-4 sm:justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy || biometricBusy}
            >
              {t('common.cancel') || '취소'}
            </Button>
            <Button type="submit" size="sm" disabled={busy || biometricBusy || !password}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t('security.verify') || '인증하고 확인하기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
