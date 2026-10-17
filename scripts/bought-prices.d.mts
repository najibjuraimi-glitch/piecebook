export function quoteFor(
  code: string,
  grade: 'raw' | 'psa9' | 'psa10' | null,
): { usd: number; sgd: number; source: string; url: string | null; asOf: string; detail: string | null } | null
