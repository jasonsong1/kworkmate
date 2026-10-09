// The interview as a manager reads it: the questions that were asked, in order, each followed by the
// candidate's answer. A question shows once even when the record carries it twice, and an answer
// never repeats the question it belongs to.
export function conversationOf(responses) {
  const out = [];
  (Array.isArray(responses) ? responses : []).forEach((turn, index) => {
    if (!turn || !turn.question) return;
    const interviewer = turn.role === 'interviewer';
    const text = interviewer ? String(turn.question).trim() : String(turn.transcript || '').trim();
    if (!interviewer && !text && !turn.file_uri) return;
    const key = `${interviewer ? 'q' : 'a'}:${text}`;
    if (out.length > 0 && out[out.length - 1].key === key) return;
    out.push({ key: `${key}-${index}`, role: interviewer ? 'interviewer' : 'candidate', text, turn });
  });
  return out;
}