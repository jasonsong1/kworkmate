import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';

export default function EmailStageEditor({ stage, values, onChange, onReset, disabled }) {
  const { t } = useI18n();
  const bodyRef = useRef(null);

  const insertVar = (name) => {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    const text = values.body || '';
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    onChange({ body: text.slice(0, start) + token + text.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t('email.subject')}</Label>
        <Input
          className="mt-1.5"
          value={values.subject}
          disabled={disabled}
          onChange={(e) => onChange({ subject: e.target.value })}
        />
      </div>

      <div>
        <Label>{t('email.heading')}</Label>
        <Input
          className="mt-1.5"
          value={values.heading}
          disabled={disabled}
          onChange={(e) => onChange({ heading: e.target.value })}
        />
      </div>

      <div>
        <Label>{t('email.body')}</Label>
        <div className="mb-2 mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t('email.placeholders')}:</span>
          {stage.vars.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => insertVar(name)}
              className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {t(`email.var.${name}`)}
            </button>
          ))}
        </div>
        <Textarea
          ref={bodyRef}
          rows={9}
          value={values.body}
          disabled={disabled}
          onChange={(e) => onChange({ body: e.target.value })}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t('email.bodyHint')}</p>
      </div>

      {stage.hasCta && (
        <div>
          <Label>{t('email.button')}</Label>
          <Input
            className="mt-1.5"
            value={values.cta}
            disabled={disabled}
            onChange={(e) => onChange({ cta: e.target.value })}
          />
        </div>
      )}

      <Button variant="ghost" size="sm" disabled={disabled} onClick={onReset}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t('email.reset')}
      </Button>
    </div>
  );
}