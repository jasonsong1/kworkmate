import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RETIRED_QUESTION_KEYS } from '@/lib/bh';

export default function QuestionBuilder({ required, custom, onChangeRequired, onChangeCustom }) {
  const visible = (required || []).filter((q) => q && !RETIRED_QUESTION_KEYS.includes(q.key));

  const toggleRequired = (key) => {
    onChangeRequired(visible.map((q) => (q.key === key ? { ...q, enabled: !q.enabled } : q)));
  };

  const setRequiredFlag = (key, value) => {
    onChangeRequired(visible.map((q) => (q.key === key ? { ...q, required: value } : q)));
  };

  const setCustomRequired = (id, value) => {
    onChangeCustom((custom || []).map((q) => (q.id === id ? { ...q, required: value } : q)));
  };

  const addCustom = () => {
    onChangeCustom([
      ...(custom || []),
      { id: `q${Date.now()}`, label: '', type: 'text', required: true }
    ]);
  };

  const updateCustom = (id, patch) => {
    onChangeCustom((custom || []).map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeCustom = (id) => {
    onChangeCustom((custom || []).filter((q) => q.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-semibold">Standard questions</p>
        <div className="divide-y rounded-lg border">
          {visible.map((q) => (
            <div key={q.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm">{q.label}</p>
                <p className="text-xs text-muted-foreground">
                  {q.enabled === false ? 'Not asked on the application form' : 'Asked on the application form'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={q.required ? 'required' : 'optional'}
                  onValueChange={(v) => setRequiredFlag(q.key, v === 'required')}
                  disabled={q.enabled === false}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
                <Switch checked={q.enabled !== false} onCheckedChange={() => toggleRequired(q.key)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Employer questions</p>
          <Button size="sm" variant="outline" onClick={addCustom}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add question
          </Button>
        </div>
        {(custom || []).length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No custom questions yet
          </p>
        ) : (
          <div className="space-y-3">
            {(custom || []).map((q) => (
              <div key={q.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_150px_130px_auto]">
                <div>
                  <Label className="text-xs">Question</Label>
                  <Input
                    value={q.label}
                    onChange={(e) => updateCustom(q.id, { label: e.target.value })}
                    placeholder="Do you have a responsible service of alcohol certificate?"
                  />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={q.type} onValueChange={(v) => updateCustom(q.id, { type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Short answer</SelectItem>
                      <SelectItem value="yesno">Yes / No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Answer</Label>
                  <Select value={q.required ? 'required' : 'optional'} onValueChange={(v) => setCustomRequired(q.id, v === 'required')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" size="icon" onClick={() => removeCustom(q.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}