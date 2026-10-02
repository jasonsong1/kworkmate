import React, { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
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

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

function hourLabel(hour) {
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export default function RosterScheduleCard({ branch }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(branch.roster_email_enabled === true);
    setDay(Number(branch.roster_email_day ?? 0));
    setHour(Number(branch.roster_email_hour ?? 20));
  }, [branch]);

  const editable = canEdit('branch_settings');

  const save = async () => {
    setSaving(true);
    await base44.entities.Branch.update(branch.id, {
      roster_email_enabled: enabled,
      roster_email_day: day,
      roster_email_hour: hour,
      roster_email_origin: window.location.origin
    });
    setSaving(false);
    toast({ title: t('rosterMail.saved') });
  };

  const summary = t(enabled ? 'rosterMail.summaryOn' : 'rosterMail.summaryOff')
    .replace('{day}', t(`day.${day}`))
    .replace('{time}', hourLabel(hour));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> {t('rosterMail.title')}
        </CardTitle>
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {t(enabled ? 'rosterMail.on' : 'rosterMail.off')}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('rosterMail.hint')}</p>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <span className="text-sm font-medium">{t('rosterMail.enabled')}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!editable} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block">{t('rosterMail.day')}</Label>
            <Select value={String(day)} onValueChange={(value) => setDay(Number(value))} disabled={!editable || !enabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {t(`day.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block">{t('rosterMail.time')}</Label>
            <Select value={String(hour)} onValueChange={(value) => setHour(Number(value))} disabled={!editable || !enabled}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {hourLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Button onClick={save} disabled={saving || !editable}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">{summary}</p>
        </div>
      </CardContent>
    </Card>
  );
}