import type { Member } from '@/features/members/model';
import type { Answer, AnswerStatus, Occurrence } from './model';

/** Who said yes / maybe / no, who is away, who hasn't answered (F5 §6.1). */
export interface AnswerSummary {
  yes: Member[];
  maybe: Member[];
  no: Member[];
  absent: Member[];
  open: Member[];
  byMember: Map<string, Answer>;
}

export function isAbsent(memberId: string, occ: Occurrence, absences: Occurrence[]): Occurrence | undefined {
  return absences.find((a) => a.event.memberId === memberId && !a.cancelled && a.startDate <= occ.endDate && a.endDate >= occ.startDate);
}

export function summarize(occ: Occurrence, answers: Answer[], members: Member[], absences: Occurrence[]): AnswerSummary {
  const byMember = new Map(answers.map((a) => [a.memberId, a]));
  const result: AnswerSummary = { yes: [], maybe: [], no: [], absent: [], open: [], byMember };
  for (const member of members) {
    const answer = byMember.get(member.id);
    if (!member.active && !answer) continue; // former members: only their old answers (F5 §9)
    if (answer) result[answer.status].push(member);
    else if (isAbsent(member.id, occ, absences)) result.absent.push(member);
    else result.open.push(member);
  }
  return result;
}

/** The event moved since the member answered → "bitte prüfen" (F5 §6.1). */
export const needsReview = (answer: Answer | undefined, occ: Occurrence) => Boolean(answer && answer.answeredFor !== occ.start);

export const statusOrder: AnswerStatus[] = ['yes', 'maybe', 'no'];
