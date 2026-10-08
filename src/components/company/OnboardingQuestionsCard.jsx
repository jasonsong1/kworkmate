import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const TYPE_KEYS = { text: 'onboardingQ.typeText', yes_no: 'onboardingQ.typeYesNo', select: 'onboardingQ.typeSelect' };

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function blankQuestion() {
  return {
    id: `q_${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    type: 'text',
    required: true,
    visible: true,
    options: [],
    follow_up: { when: 'no', fields: [] }
  };
}

// The employer's own questions for the onboarding form. Every question switched on becomes a page
// of its own, ahead of the signature the employee signs last; a yes/no question can ask for a few
// detail fields on one of its two answers.
export default function OnboardingQuestionsCard() {
  const { t } = useI18n();
  const { company, role, levelOf, reload } = useWorkspace();
  const { toast } = useToast();
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'company_admin' || ['update', 'write'].includes(levelOf('settings'));

  useEffect(() => {
    setDraft(((company && company.onboarding_questions) || []).map((question) => ({ ...blankQuestion(), ...question })));
  }, [company]);

  const set = (index, patch) =>
    setDraft((prev) => prev.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  const move = (index, delta) =>
    setDraft((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    if (!company) return;
    const cleaned = draft
      .filter((question) => String(question.label || '').trim())
      .map((question) => ({
        id: question.id,
        label: String(question.label).trim(),
        type: ['text', 'yes_no', 'select'].includes(question.type) ? question.type : 'text',
        required: question.required !== false,
        visible: question.visible !== false,
        options: question.type === 'select' ? question.options || [] : [],
        follow_up:
          question.type === 'yes_no'
            ? { when: question.follow_up && question.follow_up.when === 'yes' ? 'yes' : 'no', fields: (question.follow_up && question.follow_up.fields) || [] }
            : null
      }));
    setSaving(true);
    await base44.entities.Company.update(company.id, { onboarding_questions: cleaned });
    await reload();
    setSaving(false);
    toast({ title: t('onboardingQ.saved') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('onboardingQ.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('onboardingQ.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft.length === 0 && <p className="text-sm text-muted-foreground">{t('onboardingQ.empty')}</p>}

        {draft.map((question, index) => (
          <div key={question.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-2">
              <Input
                value={question.label}
                disabled={!canEdit}
                placeholder={t('onboardingQ.questionPlaceholder')}
                onChange={(event) => set(index, { label: event.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                disabled={!canEdit}
                title={t('onboardingQ.moveUp')}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                disabled={!canEdit}
                title={t('onboardingQ.moveDown')}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={!canEdit}
                title={t('common.delete')}
                onClick={() => setDraft((prev) => prev.filter((_, position) => position !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('onboardingQ.type')}</Label>
                <Select value={question.type} onValueChange={(value) => set(index, { type: value })} disabled={!canEdit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(TYPE_KEYS).map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(TYPE_KEYS[key])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {question.type === 'select' && (
                <div>
                  <Label>{t('onboardingQ.options')}</Label>
                  <Input
                    value={(question.options || []).join(', ')}
                    disabled={!canEdit}
                    onChange={(event) => set(index, { options: splitList(event.target.value) })}
                  />
                </div>
              )}

              {question.type === 'yes_no' && (
                <>
                  <div>
                    <Label>{t('onboardingQ.followUpWhen')}</Label>
                    <Select
                      value={(question.follow_up && question.follow_up.when) || 'no'}
                      onValueChange={(value) => set(index, { follow_up: { ...(question.follow_up || {}), when: value } })}
                      disabled={!canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">{t('onboardingQ.yes')}</SelectItem>
                        <SelectItem value="no">{t('onboardingQ.no')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('onboardingQ.followUpFields')}</Label>
                    <Input
                      value={((question.follow_up && question.follow_up.fields) || []).join(', ')}
                      disabled={!canEdit}
                      placeholder={t('onboardingQ.followUpPlaceholder')}
                      onChange={(event) =>
                        set(index, { follow_up: { ...(question.follow_up || {}), fields: splitList(event.target.value) } })
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  checked={question.required !== false}
                  disabled={!canEdit}
                  onCheckedChange={(value) => set(index, { required: value })}
                />
                {t('onboardingQ.required')}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  checked={question.visible !== false}
                  disabled={!canEdit}
                  onCheckedChange={(value) => set(index, { visible: value })}
                />
                {t('onboardingQ.visible')}
              </div>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!canEdit}
            onClick={() => setDraft((prev) => [...prev, blankQuestion()])}
          >
            <Plus className="mr-2 h-4 w-4" /> {t('onboardingQ.add')}
          </Button>
          <Button onClick={save} disabled={!canEdit || saving}>
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}