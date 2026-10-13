// A mini or video interview runs as a conversation. The employer's own questions stay the backbone
// of the interview, and after each spoken answer the interviewer asks one short follow-up about what
// the candidate actually said. Every turn is kept on the applicant record, so a manager reads the
// whole exchange and a candidate who reloads the page carries on exactly where they stopped.

export const DEFAULT_MINI_QUESTIONS = [
  { id: 'q1', question: 'Tell us about your hospitality experience and where you last worked.', seconds: 60 },
  { id: 'q2', question: 'Describe a busy shift you handled and what you did.', seconds: 60 },
  { id: 'q3', question: 'How do you handle an unhappy customer?', seconds: 45 },
  { id: 'q4', question: 'Which days and shifts can you work each week?', seconds: 45 },
  { id: 'q5', question: 'When can you start, and how long do you plan to stay with us?', seconds: 45 }
];

export const DEFAULT_VIDEO_QUESTIONS = [
  { id: 'v1', question: 'Tell us about yourself and your hospitality experience.', seconds: 60 },
  { id: 'v2', question: 'Describe a busy shift you handled and what you did.', seconds: 60 },
  { id: 'v3', question: 'How do you handle an unhappy customer?', seconds: 45 },
  { id: 'v4', question: 'Why would you like to work with us, and when can you start?', seconds: 45 }
];

// One follow-up per answer keeps the interview conversational without letting it run away.
export const MAX_FOLLOW_UPS = 1;

const FIELDS: any = {
  mini: { questions: 'interview_questions', responses: 'mini_interview_responses' },
  video: { questions: 'video_interview_questions', responses: 'video_interview_responses' }
};

// The topics the employer set for this interview, in their own order.
export function plannedTopics(company: any, kind: string) {
  const field = FIELDS[kind] || FIELDS.mini;
  const fallback = kind === 'video' ? DEFAULT_VIDEO_QUESTIONS : DEFAULT_MINI_QUESTIONS;
  const source =
    company && Array.isArray(company[field.questions]) && company[field.questions].length > 0
      ? company[field.questions]
      : fallback;
  return source
    .filter((q: any) => q && q.question)
    .map((q: any, index: number) => ({
      id: q.id || `q${index + 1}`,
      question: String(q.question).trim(),
      seconds: Number(q.seconds) || 60
    }));
}

export function turnsOf(applicant: any, kind: string) {
  const field = FIELDS[kind] || FIELDS.mini;
  const turns = applicant && applicant[field.responses];
  return Array.isArray(turns) ? turns.filter((turn: any) => turn && turn.question) : [];
}

function pointFor(topics: any[], index: number) {
  const topic = topics[index];
  if (!topic) return null;
  return { question: topic.question, topic_index: index, kind: 'planned', seconds: topic.seconds };
}

// The question the interviewer is waiting on: the last question asked while it has no answer yet,
// otherwise the next planned topic. Null means every topic has been covered.
export function resumePoint(topics: any[], turns: any[]) {
  const last = turns[turns.length - 1];
  if (last && last.role === 'interviewer') {
    return {
      question: String(last.question || ''),
      topic_index: Number(last.topic_index) || 0,
      kind: last.kind === 'followup' ? 'followup' : 'planned',
      seconds: Number(last.seconds) || 60
    };
  }
  const answers = turns.filter((turn: any) => turn.role !== 'interviewer');
  const lastAnswer = answers[answers.length - 1];
  if (!lastAnswer) return pointFor(topics, 0);
  // Interviews recorded before the conversation began carry no topic number; their position in the
  // list is the topic they answered.
  const explicit = lastAnswer.topic_index;
  const index = explicit === undefined || explicit === null ? answers.length - 1 : Number(explicit);
  return pointFor(topics, index + 1);
}

export function greetingFor(name: string, company: string, jobTitle: string) {
  const first = String(name || '').trim().split(' ')[0];
  const who = company ? `${company}'s` : 'our';
  const role = jobTitle ? ` for the ${jobTitle} role` : '';
  return `Hi${first ? ` ${first}` : ''}, thanks for your time. I'm ${who} interviewer${role}, and we'll chat through a few things. I'll ask about whatever you tell me, so just answer in your own words.`;
}

// A follow-up only makes sense once the candidate has actually said something.
function usableAnswer(transcript: string) {
  return String(transcript || '').trim().length >= 12;
}

export function followUpNeeded(turns: any[], topicIndex: number, kind: string, transcript: string) {
  if (kind !== 'planned') return false;
  if (!usableAnswer(transcript)) return false;
  const already = turns.filter(
    (turn: any) =>
      turn.role === 'interviewer' && turn.kind === 'followup' && Number(turn.topic_index) === topicIndex
  ).length;
  return already < MAX_FOLLOW_UPS;
}

export function appendAnswer(
  turns: any[],
  { question, kind, topicIndex, seconds, fileUri, transcript }: any
) {
  const at = new Date().toISOString();
  const answer = { role: 'applicant', question, topic_index: topicIndex, kind, file_uri: fileUri, transcript, answered_at: at };
  // The question the candidate is answering was often already put to them (a follow-up is written
  // once and waits for its answer), so it is only written down when it is new.
  const last = turns[turns.length - 1];
  const alreadyAsked =
    last &&
    last.role === 'interviewer' &&
    String(last.question || '').trim() === String(question || '').trim() &&
    Number(last.topic_index || 0) === Number(topicIndex || 0);
  if (alreadyAsked) return [...turns, answer];
  return [
    ...turns,
    { role: 'interviewer', question, topic_index: topicIndex, kind, seconds, asked_at: at },
    answer
  ];
}

export function followUpTurn(question: string, topicIndex: number, seconds: number) {
  return {
    role: 'interviewer',
    question,
    topic_index: topicIndex,
    kind: 'followup',
    seconds,
    asked_at: new Date().toISOString()
  };
}

const FOLLOW_UP_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' }
  },
  required: ['question']
};

// One short question about what the candidate actually said, in the interviewer's own voice.
export async function followUpFor({ base44, topic, transcript, asked, jobTitle, candidateName }: any) {
  const prompt = [
    `You are interviewing ${candidateName} for a ${jobTitle || 'hospitality'} role in Australia, by voice.`,
    `You sound like a warm, friendly person talking to a candidate, not a form being read out.`,
    ``,
    `You asked: "${topic.question}"`,
    `The candidate answered in these words: "${String(transcript || '').trim()}"`,
    asked.length ? `Questions already asked in this interview: ${asked.map((q: string) => `"${q}"`).join(', ')}` : '',
    ``,
    `Write ONE follow-up question that responds to what the candidate just said: pick out a detail they`,
    `mentioned and ask about it, so the interview feels like a real conversation.`,
    `Rules:`,
    `- One sentence, under 20 words, English, out loud, no preamble, no numbering.`,
    `- Never repeat a question already asked and never ask for something they have just told you.`,
    `- If the answer was empty or impossible to follow, ask the same question again in a simpler, more`,
    `  concrete way.`,
    `Return JSON: {"question": "<the follow-up>"}.`
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: FOLLOW_UP_SCHEMA
    });
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const question = String((parsed && parsed.question) || '').trim();
    return question.length > 4 ? question : '';
  } catch (error: any) {
    console.error('follow-up question failed', error && error.message);
    return '';
  }
}

// The spoken answer, written down so the interviewer can reply to it and the manager can read it.
export async function transcribeAnswer(base44: any, fileUri: string) {
  try {
    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: fileUri,
      expires_in: 900
    });
    const result = await base44.asServiceRole.integrations.Core.TranscribeAudio({
      audio_url: signed.signed_url
    });
    return typeof result === 'string' ? result : '';
  } catch (error: any) {
    console.error('transcription failed', error && error.message);
    return '';
  }
}