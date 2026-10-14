import React, { useEffect, useState } from 'react';
import {
  Loader2,
  Plus,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  UserPlus
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

/**
 * PlatformAdminManager 컴포넌트
 * 플랫폼 최고 관리자(슈퍼어드민) 목록을 관리하고, 새로운 슈퍼어드민을 직접 추가할 수 있는 컴포넌트입니다.
 * - 일반 사용자는 목록에서 숨겨지며, 슈퍼어드민 계정만 표시됩니다.
 * - 상단에 '슈퍼어드민 추가' 버튼을 통해 이메일과 비밀번호를 설정하여 새 관리자를 등록할 수 있습니다.
 */
export default function PlatformAdminManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { me, reload } = useWorkspace();

  // 슈퍼어드민 목록 데이터 상태
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  // 삭제 확인 다이얼로그 상태
  const [confirm, setConfirm] = useState(null);

  // 새 슈퍼어드민 추가 다이얼로그 상태
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', full_name: '', password: '' });
  const [adding, setAdding] = useState(false);

  // 슈퍼어드민 목록을 서버에서 불러오는 함수
  const loadAdmins = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('managePlatformAdmin', {
        action: 'search',
        query: ''
      });
      // 서버에서 슈퍼어드민만 내려주지만, 클라이언트에서도 안전하게 관리자 계정만 필터링합니다.
      const users = (response.data?.users || []).filter(
        (u) => u.role === 'admin' || (u.email && u.email.toLowerCase() === 'sym910403@gmail.com')
      );
      setRows(users);
    } catch (err) {
      console.error('슈퍼어드민 목록 로드 오류:', err);
      toast({
        title: '관리자 목록을 불러오지 못했습니다.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  // 슈퍼어드민 권한 변경 (부여/해제)
  const change = async (user, action) => {
    setBusyId(user.id);
    const response = await base44.functions.invoke('managePlatformAdmin', { action, user_id: user.id });
    setBusyId('');
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    const role = response.data.role;
    setRows((prev) => prev.map((item) => (item.id === user.id ? { ...item, role } : item)));
    toast({ title: action === 'grant' ? t('platform.granted') : t('platform.revoked') });
    if (me && me.id === user.id) reload();
  };

  // 슈퍼어드민 계정 삭제 처리
  const remove = async (user) => {
    setBusyId(user.id);
    const response = await base44.functions.invoke('managePlatformAdmin', { action: 'delete', user_id: user.id });
    setBusyId('');
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    setConfirm(null);
    setRows((prev) => prev.filter((item) => item.id !== user.id));
    toast({ title: t('platform.deleted') });
  };

  // 새 슈퍼어드민 계정 추가 처리
  const handleAddSuperAdmin = async (e) => {
    e.preventDefault();
    if (!addForm.email || !addForm.password) {
      toast({ title: '이메일과 비밀번호를 모두 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (addForm.password.length < 6) {
      toast({ title: '비밀번호는 최소 6자 이상이어야 합니다.', variant: 'destructive' });
      return;
    }

    setAdding(true);
    try {
      const response = await base44.functions.invoke('managePlatformAdmin', {
        action: 'create',
        email: addForm.email.trim(),
        full_name: addForm.full_name.trim(),
        password: addForm.password
      });

      if (response.data?.error) {
        toast({ title: response.data.error, variant: 'destructive' });
        return;
      }

      toast({ title: '새 슈퍼어드민 계정이 등록되었습니다.' });
      setAddModalOpen(false);
      setAddForm({ email: '', full_name: '', password: '' });
      await loadAdmins();
    } catch (err) {
      toast({ title: err.message || '등록 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('platform.superAdmins') || '슈퍼어드민 관리'}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              플랫폼 전체를 총괄하는 슈퍼어드민 목록입니다. 필요한 경우 새 관리자를 직접 추가할 수 있습니다.
            </p>
          </div>
          {/* 슈퍼어드민 추가 버튼 */}
          <Button size="sm" onClick={() => setAddModalOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            슈퍼어드민 추가
          </Button>
        </CardHeader>

        <CardContent className="p-4 pt-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('platform.empty')}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {rows.map((user) => {
                const isSuper = user.role === 'admin';
                const isMe = Boolean(
                  (me && me.id === user.id) ||
                  (me && me.email && user.email && me.email.toLowerCase() === user.email.toLowerCase())
                );
                return (
                  <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-muted/40 transition-colors">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{user.full_name || user.email}</span>
                        {isSuper && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                            <ShieldCheck className="mr-1 h-3 w-3" /> {t('platform.superAdmin')}
                          </Badge>
                        )}
                        {isMe && <span className="text-xs text-muted-foreground font-normal">({t('platform.you')})</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isSuper ? 'outline' : 'default'}
                        disabled={busyId === user.id || isMe}
                        onClick={() => change(user, isSuper ? 'revoke' : 'grant')}
                      >
                        {busyId === user.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : isSuper ? (
                          <ShieldMinus className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {isSuper ? t('platform.revoke') : t('platform.grant')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={t('common.delete')}
                        disabled={busyId === user.id || isMe}
                        onClick={() => setConfirm(user)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 새 슈퍼어드민 추가 모달 다이얼로그 */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              새 슈퍼어드민 추가
            </DialogTitle>
            <DialogDescription>
              추가할 관리자의 이메일과 비밀번호를 입력해주세요. 등록 즉시 플랫폼 전체 권한이 부여됩니다.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddSuperAdmin} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">이메일 계정 <span className="text-destructive">*</span></Label>
              <Input
                id="admin-email"
                type="email"
                required
                placeholder="admin@example.com"
                value={addForm.email}
                onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-name">이름 (선택)</Label>
              <Input
                id="admin-name"
                placeholder="홍길동"
                value={addForm.full_name}
                onChange={(e) => setAddForm((prev) => ({ ...prev, full_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-pw">비밀번호 <span className="text-destructive">*</span></Label>
              <Input
                id="admin-pw"
                type="password"
                required
                minLength={6}
                placeholder="최소 6자 이상 입력"
                value={addForm.password}
                onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={adding}>
                {adding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                추가하기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 기존 슈퍼어드민 삭제 확인 다이얼로그 */}
      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('platform.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('platform.deleteHint').replace(
                '{name}',
                (confirm && (confirm.full_name || confirm.email)) || ''
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove(confirm)} disabled={busyId === (confirm && confirm.id)}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}