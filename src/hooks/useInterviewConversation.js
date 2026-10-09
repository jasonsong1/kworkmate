import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// The conversation state both interviews share: load where the candidate left off, hand each spoken
// answer to the server, and show the interviewer's next question. The server decides which question
// was being answered, so the candidate can reload the page at any point and carry on.
export default function useInterviewConversation({ token, getFunction, submitFunction }) {
  const [state, setState] = useState('loading'); // loading | missing | ready | done
  const [data, setData] = useState(null);
  const [turns, setTurns] = useState([]);
  const [current, setCurrent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await base44.functions.invoke(getFunction, { token });
      const payload = response.data || {};
      if (payload.error || typeof payload.total === 'undefined') {
        setState('missing');
        return;
      }
      setData(payload);
      setTurns(payload.turns || []);
      setCurrent(payload.next || null);
      setState(payload.completed ? 'done' : 'ready');
    } catch (err) {
      setState('missing');
    }
  }, [token, getFunction]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (fileUri) => {
    if (!current || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await base44.functions.invoke(submitFunction, { token, file_uri: fileUri });
      const payload = response.data || {};
      if (payload.error) throw new Error(payload.error);
      setTurns(payload.turns || []);
      if (payload.completed || !payload.next) {
        setCurrent(null);
        setState('done');
        return;
      }
      setCurrent(payload.next);
      setState('ready');
    } catch (err) {
      setError(err.message || 'Your answer could not be saved. Please try again.');
      setState('ready');
    } finally {
      setSaving(false);
    }
  };

  return { state, data, turns, current, saving, error, setError, answer };
}