export type MatchField = 'subject' | 'summary' | 'documents';

export interface SimilarityCase {
  id: string;
  title: string;
  description: string | null;
  documentText?: string | null;
}

export interface RelatedSuggestion<T extends SimilarityCase = SimilarityCase> {
  case: T;
  score: number;
  matchedOn: MatchField[];
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'for',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'as',
  'is',
  'was',
  'were',
  'be',
  'been',
  'this',
  'that',
  'those',
  'these',
  'into',
  'over',
  'under',
  'than',
  'then',
  'also',
  'or',
  'not',
  'no',
  'its',
  'their',
  'there',
  'here',
  'case',
  'file',
  'memo',
  'letter',
  'request',
  'closed',
  'overdue',
  'approved',
  'archived',
  'now',
  'after',
  'before',
  'about',
  'regarding',
  'في',
  'من',
  'على',
  'إلى',
  'الى',
  'عن',
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'مع',
  'ما',
  'لا',
  'أن',
  'ان',
  'إن',
  'كان',
  'كانت',
  'يتم',
  'بشأن',
  'حول',
  'خلال',
  'بعد',
  'قبل',
  'غير',
  'بين',
  'كل',
  'أو',
  'او',
  'و',
  'ثم',
  'قد',
  'تم',
  'وفق',
  'حسب',
  'لدى',
  'ملف',
  'معاملة',
  'خطاب',
  'مذكرة',
  'طلب',
]);

const MIN_SCORE = 0.16;
const MAX_RESULTS = 8;

export function scoreRelatedCases<T extends SimilarityCase>(
  source: T,
  candidates: T[],
  options?: { limit?: number; minScore?: number },
): RelatedSuggestion<T>[] {
  const limit = options?.limit ?? MAX_RESULTS;
  const minScore = options?.minScore ?? MIN_SCORE;
  const sourceNorm = normalizeRecord(source);

  return candidates
    .map((candidate) => {
      if (candidate.id === source.id) {
        return null;
      }
      const targetNorm = normalizeRecord(candidate);
      if (isIdentical(sourceNorm, targetNorm)) {
        return null;
      }
      const subject = fieldSimilarity(sourceNorm.title, targetNorm.title);
      const summary = fieldSimilarity(
        sourceNorm.description,
        targetNorm.description,
      );
      const documents = fieldSimilarity(
        sourceNorm.documentText,
        targetNorm.documentText,
      );
      const weights = activeWeights(sourceNorm);
      const score =
        subject * weights.subject +
        summary * weights.summary +
        documents * weights.documents;
      if (score < minScore) {
        return null;
      }
      const matchedOn: MatchField[] = [];
      if (subject >= 0.18) matchedOn.push('subject');
      if (summary >= 0.18) matchedOn.push('summary');
      if (documents >= 0.18) matchedOn.push('documents');
      if (!matchedOn.length) {
        return null;
      }
      return { case: candidate, score, matchedOn };
    })
    .filter((item): item is RelatedSuggestion<T> => Boolean(item))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function normalizeRecord(record: SimilarityCase) {
  return {
    title: normalizeText(record.title),
    description: normalizeText(record.description),
    documentText: normalizeText(record.documentText),
  };
}

function isIdentical(
  source: ReturnType<typeof normalizeRecord>,
  target: ReturnType<typeof normalizeRecord>,
) {
  return (
    Boolean(source.title) &&
    source.title === target.title &&
    source.description === target.description
  );
}

function activeWeights(source: ReturnType<typeof normalizeRecord>) {
  const weights = {
    subject: source.title ? 0.45 : 0,
    summary: source.description ? 0.35 : 0,
    documents: source.documentText ? 0.2 : 0,
  };
  const total = weights.subject + weights.summary + weights.documents;
  if (!total) {
    return { subject: 1, summary: 0, documents: 0 };
  }
  return {
    subject: weights.subject / total,
    summary: weights.summary / total,
    documents: weights.documents / total,
  };
}

function fieldSimilarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 0.92;
  }
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const tokenScore = dice(leftTokens, rightTokens);
  const distinctiveScore = distinctiveOverlap(leftTokens, rightTokens);
  const trigramScore = dice(trigrams(left), trigrams(right));
  return clamp(
    tokenScore * 0.5 + distinctiveScore * 0.3 + trigramScore * 0.2,
    0,
    1,
  );
}

export function tokenize(value: string): Set<string> {
  const tokens = new Set<string>();
  const parts = normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length >= 2 && !STOPWORDS.has(part));
  for (const part of parts) {
    tokens.add(part);
    if (part.length >= 6) {
      tokens.add(part.slice(0, 5));
    }
  }
  return tokens;
}

function trigrams(value: string): Set<string> {
  const compact = normalizeText(value).replace(/\s+/g, ' ');
  const grams = new Set<string>();
  if (compact.length < 3) {
    if (compact) grams.add(compact);
    return grams;
  }
  for (let index = 0; index <= compact.length - 3; index += 1) {
    grams.add(compact.slice(index, index + 3));
  }
  return grams;
}

function distinctiveOverlap(left: Set<string>, right: Set<string>): number {
  const distinctive = [...left].filter((token) => token.length >= 4);
  if (!distinctive.length) {
    return 0;
  }
  let hits = 0;
  for (const token of distinctive) {
    if (right.has(token)) {
      hits += 1;
    }
  }
  return hits / distinctive.length;
}

function dice(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return (2 * intersection) / (left.size + right.size);
}

function normalizeText(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
