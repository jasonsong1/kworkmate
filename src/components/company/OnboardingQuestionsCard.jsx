import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { DEFAULT_ONBOARDING_QUESTIONS } from '@/lib/onboardingDefaults';
import { saveCompanySettings } from '@/lib/companySettings';
import { DATE_FORMATS } from '@/lib/onboardingDates';
import { base44 } from '@/api/base44Client';

const TYPE_KEYS = {
  text: 'onboardingQ.typeText',
  number: 'onboardingQ.typeNumber',
  date: 'onboardingQ.typeDate',
  yes_no: 'onboardingQ.typeYesNo',
  select: 'onboardingQ.typeSelect',
  upload: 'onboardingQ.typeUpload'
};
const TYPES = Object.keys(TYPE_KEYS);

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// The employer's own rule for one answer, kept beside the question: how many digits a number may
// hold, whether a date is a whole day or only a year, and which file types may be attached.
function validationOf(question) {
  if (question.type === 'number') {
    return { digits: Number(question.digits) > 0 ? Number(question.digits) : 0 };
  }
  if (question.type === 'date') {
    return { format: DATE_FORMATS.includes(question.dateFormat) ? question.dateFormat : DATE_FORMATS[0] };
  }
  if (question.type === 'upload') {
    return { file_types: splitList(question.fileTypesText) };
  }
  return null;
}

function blankQuestion(page) {
  return {
    id: `q_${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    type: 'text',
    required: true,
    visible: true,
    page: page || 1,
    pageTitle: '',
    when: 'no',
    // The comma-separated lists are held as the manager typed them, so a comma can be typed.
    optionsText: '',
    fieldsText: '',
    digits: '',
    dateFormat: DATE_FORMATS[0],
    fileTypesText: ''
  };
}

function toDraft(questions) {
  return (questions || []).map((question, index) => {
    const validation = question.validation || {};
    return {
      id: question.id || `q_${Math.random().toString(36).slice(2, 9)}`,
      label: question.label || '',
      type: TYPES.includes(question.type) ? question.type : 'text',
      required: question.required !== false,
      visible: question.visible !== false,
      page: Number(question.page) > 0 ? Number(question.page) : index + 1,
      pageTitle: question.page_title || '',
      when: question.follow_up && question.follow_up.when === 'yes' ? 'yes' : 'no',
      optionsText: (question.options || []).join(', '),
      fieldsText: ((question.follow_up && question.follow_up.fields) || []).join(', '),
      digits: Number(validation.digits) > 0 ? String(validation.digits) : '',
      dateFormat: DATE_FORMATS.includes(validation.format) ? validation.format : DATE_FORMATS[0],
      fileTypesText: (validation.file_types || []).join(', ')
    };
  });
}

// The employer's own questions for the onboarding form. Questions sharing a page number appear
// together on one page, and the signature the employee signs comes last.
export default function OnboardingQuestionsCard() {
  const { t } = useI18n();
  const { company, role, presetKey, isManager, levelOf, reload } = useWorkspace();
  const { toast } = useToast();
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const canEdit =
    role === 'company_admin' ||
    isManager ||
    ['manager', 'supervisor_manager'].includes(presetKey) ||
    ['update', 'write'].includes(levelOf('settings'));

  useEffect(() => {
    setDraft(toDraft(company && company.onboarding_questions));
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

  // A new question continues on the current page; "New page" opens the next one.
  const add = (newPage) => {
    const last = draft[draft.length - 1];
    const page = newPage ? (last ? Number(last.page) || 1 : 1) + 1 : last ? Number(last.page) || 1 : 1;
    setDraft((prev) => [...prev, blankQuestion(page)]);
  };

  // The standard form, ready to review before it is saved: personal details, tax, super and
  // bank, with the signature still coming last on the employee's own page.
  const loadDefaults = () => {
    setDraft(toDraft(DEFAULT_ONBOARDING_QUESTIONS));
    toast({ title: t('onboardingQ.defaultsLoaded') });
  };

  const save = async () => {
    if (!company) return;
    const cleaned = draft
      .filter((question) => String(question.label || '').trim())
      .map((question, index) => ({
        id: question.id,
        label: String(question.label).trim(),
        type: TYPES.includes(question.type) ? question.type : 'text',
        required: question.required !== false,
        visible: question.visible !== false,
        page: Number(question.page) > 0 ? Number(question.page) : index + 1,
        page_title: String(question.pageTitle || '').trim(),
        options: question.type === 'select' ? splitList(question.optionsText) : [],
        follow_up:
          question.type === 'yes_no'
            ? { when: question.when === 'yes' ? 'yes' : 'no', fields: splitList(question.fieldsText) }
            : null,
        validation: validationOf(question)
      }));
    setSaving(true);
    try {
      await saveCompanySettings(company.id, { onboarding_questions: cleaned });
      await reload();
      toast({ title: t('onboardingQ.saved') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t('onboardingQ.title')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('onboardingQ.hint')}</p>
        </div>
        <Button variant="outline" size="sm" disabled={!canEdit} onClick={loadDefaults}>
          <FileText className="mr-2 h-4 w-4" /> {t('onboardingQ.makeDefault')}
        </Button>
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
                <Label>{t('onboardingQ.page')}</Label>
                <Input
                  type="number"
                  min="1"
                  value={question.page}
                  disabled={!canEdit}
                  onChange={(event) => set(index, { page: event.target.value })}
                />
              </div>
              <div>
                <Label>{t('onboardingQ.pageTitle')}</Label>
                <Input
                  value={question.pageTitle}
                  disabled={!canEdit}
                  onChange={(event) => set(index, { pageTitle: event.target.value })}
                />
              </div>

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
                    value={question.optionsText}
                    disabled={!canEdit}
                    onChange={(event) => set(index, { optionsText: event.target.value })}
                  />
                </div>
              )}

              {question.type === 'number' && (
                <div>
                  <Label>{t('onboardingQ.digits')}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={question.digits}
                    disabled={!canEdit}
                    placeholder="9"
                    onChange={(event) => set(index, { digits: event.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('onboardingQ.digitsHint')}</p>
                </div>
              )}

              {question.type === 'date' && (
                <div>
                  <Label>{t('onboardingQ.dateFormat')}</Label>
                  <Select
                    value={question.dateFormat}
                    onValueChange={(value) => set(index, { dateFormat: value })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {format}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {question.type === 'upload' && (
                <div>
                  <Label>{t('onboardingQ.fileTypes')}</Label>
                  <Input
                    value={question.fileTypesText}
                    disabled={!canEdit}
                    placeholder="pdf, jpg, png"
                    onChange={(event) => set(index, { fileTypesText: event.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('onboardingQ.fileTypesHint')}</p>
                </div>
              )}

              {question.type === 'yes_no' && (
                <>
                  <div>
                    <Label>{t('onboardingQ.followUpWhen')}</Label>
                    <Select
                      value={question.when}
                      onValueChange={(value) => set(index, { when: value })}
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
                      value={question.fieldsText}
                      disabled={!canEdit}
                      placeholder={t('onboardingQ.followUpPlaceholder')}
                      onChange={(event) => set(index, { fieldsText: event.target.value })}
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
          <Button variant="outline" disabled={!canEdit} onClick={() => add(false)}>
            <Plus className="mr-2 h-4 w-4" /> {t('onboardingQ.add')}
          </Button>
          <Button variant="outline" disabled={!canEdit} onClick={() => add(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('onboardingQ.addPage')}
          </Button>
          <Button onClick={save} disabled={!canEdit || saving}>
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}