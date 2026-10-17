import React, { useState } from 'react';
import { ArrowDown, ArrowUp, FileText, GripVertical, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { DEFAULT_ONBOARDING_QUESTIONS } from '@/lib/onboardingDefaults';
import { DATE_FORMATS } from '@/lib/onboardingDates';
import { TYPE_KEYS, blankQuestion, toDraft } from '@/lib/onboardingQuestions';

// The employer's own questions for the onboarding form: what the employee is asked on their
// onboarding link, and what the document vault shows back. Questions sharing a page number appear
// together on one page, and the signature the employee signs comes last. The list is held by the
// settings page and saved with its own Save, so this card offers no button of its own.
export default function OnboardingQuestionsCard({ questions = [], onChange, canEdit = false }) {
  const { t } = useI18n();
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const set = (index, patch) =>
    onChange(questions.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e, index) => {
    if (!canEdit) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (!canEdit || draggedIndex === null || draggedIndex === index) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (!canEdit || draggedIndex === null || draggedIndex === targetIndex) {
      handleDragEnd();
      return;
    }
    const next = [...questions];
    const [draggedItem] = next.splice(draggedIndex, 1);
    next.splice(targetIndex, 0, draggedItem);
    onChange(next);
    handleDragEnd();
  };

  // A new question continues on the current page; "New page" opens the next one.
  const add = (newPage) => {
    const last = questions[questions.length - 1];
    const page = newPage ? (last ? Number(last.page) || 1 : 1) + 1 : last ? Number(last.page) || 1 : 1;
    onChange([...questions, blankQuestion(page)]);
  };

  // The standard form, ready to review before it is saved: personal details, tax, super and
  // bank, with the signature still coming last on the employee's own page.
  const loadDefaults = () => onChange(toDraft(DEFAULT_ONBOARDING_QUESTIONS));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t('onboardingQ.title')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('onboardingQ.hint')}</p>
          <p className="mt-0.5 text-xs text-primary font-medium">
            {t('ob.dragReorderNotice')}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={!canEdit} onClick={loadDefaults}>
          <FileText className="mr-2 h-4 w-4" /> {t('onboardingQ.makeDefault')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.length === 0 && <p className="text-sm text-muted-foreground">{t('onboardingQ.empty')}</p>}

        {questions.map((question, index) => {
          const isDragging = draggedIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={question.id}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, index)}
              className={`space-y-3 rounded-xl border p-4 transition-all duration-150 ${
                isDragging
                  ? 'opacity-40 border-dashed border-primary bg-primary/5 scale-[0.99]'
                  : isDragOver
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'bg-card hover:border-slate-300'
              }`}
            >
              <div className="flex items-start gap-2">
                {canEdit && (
                  <div
                    className="flex h-9 w-6 cursor-grab active:cursor-grabbing items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                    title="드래그하여 순서 변경"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>
                )}
                <Input
                  value={question.label}
                  disabled={!canEdit}
                  placeholder={t('onboardingQ.questionPlaceholder')}
                  onChange={(event) => set(index, { label: event.target.value })}
                  className="flex-1"
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
                onClick={() => onChange(questions.filter((_, position) => position !== index))}
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
              {/* What the employee answers lands in the document vault, and this switch keeps one
                  answer out of it. */}
              <div className="flex items-center gap-2 text-sm" title={t('onboardingQ.visibleHint')}>
                <Switch
                  checked={question.visible !== false}
                  disabled={!canEdit}
                  onCheckedChange={(value) => set(index, { visible: value })}
                />
                {t('onboardingQ.visible')}
              </div>
              {/* 암호화 보안 스위치: 켜면 직원의 내 공간에서 답변이 블러 처리되고 본인 인증 후 열람 */}
              <div
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                title="켜면 직원의 내 공간에서 이 질문의 답변이 블러 처리되며, 비밀번호 또는 얼굴인식(생체인증)을 통과해야 확인할 수 있습니다."
              >
                <Switch
                  checked={Boolean(question.secure)}
                  disabled={!canEdit}
                  onCheckedChange={(value) => set(index, { secure: value })}
                />
                <div className="flex items-center gap-1">
                  <Lock className={`h-3.5 w-3.5 ${question.secure ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <span>암호화 보안</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!canEdit} onClick={() => add(false)}>
            <Plus className="mr-2 h-4 w-4" /> {t('onboardingQ.add')}
          </Button>
          <Button variant="outline" disabled={!canEdit} onClick={() => add(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('onboardingQ.addPage')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}