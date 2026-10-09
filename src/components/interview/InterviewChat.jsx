import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

// The interview as a conversation: the greeting, everything said so far, and the question the
// candidate is on now.
export default function InterviewChat({ greeting, turns, current, thinking }) {
  const endRef = useRef(null);
  const list = Array.isArray(turns) ? turns : [];

  useEffect(() => {
    if (endRef.current && endRef.current.scrollIntoView) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [list.length, current, thinking]);

  return (
    <div className="space-y-3">
      {greeting ? <Bubble side="them" text={greeting} /> : null}
      {list.map((turn, index) =>
        turn.role === 'interviewer' ? (
          <Bubble key={index} side="them" text={turn.question} />
        ) : (
          <Bubble key={index} side="me" text={turn.transcript || 'Answer recorded'} />
        )
      )}
      {current ? <Bubble side="them" text={current.question} /> : null}
      {thinking ? (
        <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Thinking about your answer…
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

function Bubble({ side, text }) {
  const mine = side === 'me';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          mine ? 'rounded-br-sm bg-slate-900 text-white' : 'rounded-bl-sm bg-white text-slate-800'
        }`}
      >
        {text}
      </p>
    </div>
  );
}