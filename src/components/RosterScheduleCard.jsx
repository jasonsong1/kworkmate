import React, { useEffect, useState } from 'react';
import { Clock, Loader2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions';
import { base44 } from '@/api/base44Client';

// 요일 목록 (0: 일요일 ~ 6: 토요일)
const DAYS = [0, 1, 2, 3, 4, 5, 6];

// 시간 목록 (0시 ~ 23시)
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// 분 목록 (00분 ~ 55분, 5분 단위)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

// 호주 주(State)별 타임존 및 대표 도시 정보
const STATE_TIMEZONES = {
  NSW: { zone: 'Australia/Sydney', city: '시드니 (Sydney)' },
  ACT: { zone: 'Australia/Sydney', city: '캔버라 (Canberra)' },
  VIC: { zone: 'Australia/Melbourne', city: '멜버른 (Melbourne)' },
  QLD: { zone: 'Australia/Brisbane', city: '브리즈번 (Brisbane)' },
  SA: { zone: 'Australia/Adelaide', city: '애들레이드 (Adelaide)' },
  WA: { zone: 'Australia/Perth', city: '퍼스 (Perth)' },
  TAS: { zone: 'Australia/Hobart', city: '호바트 (Hobart)' },
  NT: { zone: 'Australia/Darwin', city: '다윈 (Darwin)' }
};

function getBranchZoneInfo(branch) {
  const st = String(branch?.state || '').trim().toUpperCase();
  return STATE_TIMEZONES[st] || { zone: 'Australia/Sydney', city: '호주 동부 (시드니 기준)' };
}

// 12시간제 및 24시간제 시간 라벨 포맷터
function formatHourLabel(hour) {
  const period = hour >= 12 ? '오후' : '오전';
  const displayH = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayH}시 (${String(hour).padStart(2, '0')}:00)`;
}

export default function RosterScheduleCard({ branch }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { canEdit } = usePermissions();

  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [saving, setSaving] = useState(false);

  const zoneInfo = getBranchZoneInfo(branch);

  // 지점의 저장된 설정 불러오기
  useEffect(() => {
    if (!branch) return;
    setEnabled(branch.roster_email_enabled === true);
    setDay(Number(branch.roster_email_day ?? 0));
    setHour(Number(branch.roster_email_hour ?? 20));
    setMinute(Number(branch.roster_email_minute ?? 0));
  }, [branch]);

  const editable = canEdit('branches');

  // 시간 세팅 저장
  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Branch.update(branch.id, {
        roster_email_enabled: enabled,
        roster_email_day: day,
        roster_email_hour: hour,
        roster_email_minute: minute,
        roster_email_origin: window.location.origin
      });
      toast({
        title: '발송 일정 저장 완료',
        description: `매주 ${t(`day.${day}`)} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (${zoneInfo.city} 기준)으로 저장되었습니다.`
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '저장 실패',
        description: err.message || '설정을 저장하지 못했습니다.'
      });
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = t(`day.${day}`);
  const formattedTime = `${hour >= 12 ? '오후' : '오전'} ${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} (${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')})`;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Mail className="h-4 w-4 text-primary" />
            근무 가능 시간 요청 이메일 자동 발송 일정
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            다음 주 시프트 작성을 위해 직원들에게 근무 가능 시간(Availability) 입력을 요청하는 이메일 발송 일정을 세팅합니다.
          </p>
        </div>
        <Badge variant={enabled ? 'default' : 'secondary'} className="shrink-0 text-xs">
          {enabled ? '자동 발송 켜짐' : '꺼짐'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* 지점 지역 기준 시각 안내 배너 */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-2 text-xs">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong className="text-foreground">지점 지역 기준:</strong> {zoneInfo.city} ({zoneInfo.zone})
          </span>
        </div>

        {/* 자동 발송 활성화 토글 */}
        <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/20">
          <div>
            <span className="text-sm font-medium">정기 자동 발송 사용</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              설정한 요일과 시간(지점 지역 기준)에 활성 직원들에게 이메일을 자동 발송합니다.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!editable} />
        </div>

        {/* 요일, 시, 분 선택 그리드 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">발송 요일</Label>
            <Select
              value={String(day)}
              onValueChange={(value) => setDay(Number(value))}
              disabled={!editable || !enabled}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((value) => (
                  <SelectItem key={value} value={String(value)} className="text-xs">
                    {t(`day.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold">시</Label>
            <Select
              value={String(hour)}
              onValueChange={(value) => setHour(Number(value))}
              disabled={!editable || !enabled}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {HOURS.map((value) => (
                  <SelectItem key={value} value={String(value)} className="text-xs">
                    {formatHourLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold">분</Label>
            <Select
              value={String(minute)}
              onValueChange={(value) => setMinute(Number(value))}
              disabled={!editable || !enabled}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {MINUTES.map((value) => (
                  <SelectItem key={value} value={String(value)} className="text-xs">
                    {String(value).padStart(2, '0')}분
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 안내 요약 카드 */}
        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground border">
          {enabled ? (
            <p>
              💡 매주 <strong className="text-foreground">{dayLabel} {formattedTime}</strong> ({zoneInfo.city} 지역 기준)에 해당 매장의 모든 활성 직원에게 근무 희망 시간 입력 안내 메일이 자동 전송됩니다.
            </p>
          ) : (
            <p>
              현재 자동 발송이 꺼져 있습니다. 위 스위치를 켜고 요일과 시간을 설정하신 후 저장해주세요.
            </p>
          )}
        </div>

        {/* 저장 버튼 */}
        <div className="pt-2 border-t">
          <Button
            onClick={save}
            disabled={saving || !editable}
            size="sm"
            className="font-semibold text-xs h-9 px-6"
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}