import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function AddBranchDialog({ open, onOpenChange }) {
  const { reload } = useWorkspace();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', code: '', address: '', suburb: '', state: '', postcode: '' });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Branch name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const response = await base44.functions.invoke('createBranch', { branch: form });
    setSaving(false);
    if (response.data?.error) {
      setError(response.data.error);
      return;
    }
    await reload();
    setForm({ name: '', code: '', address: '', suburb: '', state: '', postcode: '' });
    onOpenChange(false);
    toast({ title: 'Branch added' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add branch</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Branch name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="KFC Airport" />
          </div>
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="AIR" />
          </div>
          <div>
            <Label>Suburb</Label>
            <Input value={form.suburb} onChange={(e) => set('suburb', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set('state', e.target.value)} />
          </div>
          <div>
            <Label>Postcode</Label>
            <Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}