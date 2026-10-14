import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

/**
 * [AddCompanyDialog]
 * 플랫폼 슈퍼어드민이 새로운 회사를 추가할 때 사용하는 대화상자 컴포넌트입니다.
 * Supabase Edge Function('createCompany')을 호출하며,
 * 에러 발생 시 무한 로딩에 빠지지 않고 명확한 한국어 안내 메시지를 UI에 보여줍니다.
 */
export default function AddCompanyDialog({ open, onOpenChange }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 대화상자가 열릴 때마다 이전 입력값과 에러 상태를 깨끗이 초기화합니다.
  useEffect(() => {
    if (open) {
      setName('');
      setAbn('');
      setError('');
      setSaving(false);
    }
  }, [open]);

  // 서버로부터 전달받은 오류를 사용자가 이해하기 쉬운 친절한 한국어로 변환합니다.
  const formatErrorMessage = (rawError, companyName) => {
    if (!rawError) return '회사 생성 중 알 수 없는 오류가 발생했습니다.';
    const str = String(rawError);

    if (str.includes('already exists') || str.includes('중복')) {
      return `'${companyName}'(은)는 이미 등록된 회사 이름입니다. 다른 고유한 회사 이름을 입력해 주세요.`;
    }
    if (str.includes('Unauthorized') || str.includes('Sign-in required')) {
      return '인증 세션이 유효하지 않습니다 (Unauthorized). 페이지를 새로고침하거나 다시 로그인해 주세요.';
    }
    if (str.includes('Only the platform admin')) {
      return '회사 생성 권한이 없습니다. 플랫폼 슈퍼어드민 계정으로만 새로운 회사를 추가할 수 있습니다.';
    }
    if (str.includes('Company name is required')) {
      return '회사 이름을 반드시 입력해 주세요.';
    }
    return `회사 생성 실패 안내: ${str}`;
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('company.nameRequired') || '회사 이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // 1. Supabase Edge Function 'createCompany' 호출
      const response = await base44.functions.invoke('createCompany', {
        name: trimmedName,
        abn: abn.trim()
      });

      // 2. 서버 에러 응답 처리
      if (response?.data?.error) {
        const friendlyMsg = formatErrorMessage(response.data.error, trimmedName);
        setError(friendlyMsg);
        return;
      }

      // 3. 정상 생성 완료 처리
      await refreshWorkspace();
      onOpenChange(false);
      toast({
        title: t('company.created') || '회사가 성공적으로 생성되었습니다!'
      });
      navigate('/branches');
    } catch (err) {
      console.error('회사 생성 처리 중 예외 발생:', err);
      const friendlyMsg = formatErrorMessage(err?.message || err, trimmedName);
      setError(friendlyMsg);
    } finally {
      // 에러가 나더라도 무한 로딩 스피너에 갇히지 않도록 반드시 로딩 상태를 해제합니다.
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('company.new') || '새 회사 추가'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 에러 발생 시 명확하고 눈에 띄는 빨간색 알림 카드 UI 노출 */}
          {error && (
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-red-900">생성 실패 안내</p>
                <p className="text-red-700 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="company-name">{t('company.nameLabel') || '회사 이름'} *</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(''); // 타이핑 시 기존 에러 메시지 자동 초기화
              }}
              placeholder="예: Burger King, KFC 등"
              disabled={saving}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="company-abn">{t('company.abn') || '사업자 번호 (ABN)'}</Label>
            <Input
              id="company-abn"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              placeholder="예: 12 345 678 901"
              disabled={saving}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {t('company.createHint') || '회사를 생성하면 기본 관리자 설정과 첫 번째 지점을 등록할 수 있습니다.'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel') || '취소'}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                생성 중...
              </>
            ) : (
              t('company.create') || '회사 생성'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}