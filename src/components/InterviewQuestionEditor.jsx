import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

export default function InterviewQuestionEditor({ questions, onChange }) {
  const { t } = useI18n();
  const list = Array.isArray(questions) ? questions : [];

  const update = (id, patch) => {
    onChange(list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const add = () => {
    onChange([...list, { id: `q${Date.now()}`, question: '', seconds: 60 }]);
  };

  const remove = (id) => {
    onChange(list.filter((q) => q.id !== id));
  };

  if (list.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t('interview.none')}
        </p>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('interview.addQuestion')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((q, index) => (
        <div key={q.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_120px_auto]">
          <div>
            <Label className="text-xs">
              {t('interview.question')} {index + 1}
            </Label>
            <Input
              value={q.question}
              onChange={(e) => update(q.id, { question: e.target.value })}
              placeholder="Tell us about your hospitality experience."
            />
          </div>
          <div>
            <Label className="text-xs">{t('interview.seconds')}</Label>
            <Input
              type="number"
              value={q.seconds ?? 60}
              onChange={(e) => update(q.id, { seconds: Number(e.target.value) || 60 })}
            />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="icon" onClick={() => remove(q.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {t('interview.addQuestion')}
      </Button>
    </div>
  );
}