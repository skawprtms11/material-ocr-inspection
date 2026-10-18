// OCR 검수 판정용 순수 함수. 서버 판정과 화면 비교 표시가 같은 규칙을 쓰도록 공용으로 둔다.
// 숫자 일치 조건은 두지 않는다(대표님 결정) — 일치율 하나로만 판정한다.

export const DEFAULT_OCR_PASS_THRESHOLD = 90;

const hyphenVariants = /[‐-―−﹘﹣－]/g;

// 공백·줄바꿈과 함께 제거할 보이지 않는 문자(제로폭 공백·접합자·단어결합자·BOM).
const invisibleChars = /[\s\u200B-\u200D\u2060\uFEFF]+/g;

export function normalizeOcrText(value: string): string {
  return value.normalize("NFKC").replace(hyphenVariants, "-").toUpperCase().replace(invisibleChars, "");
}

function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export type OcrMatchResult = {
  rate: number;
  passed: boolean;
  normalizedExpected: string;
  normalizedRecognized: string;
};

// 일치율(%) = (1 - 편집거리 / 긴 쪽 길이) × 100, 소수 1자리 내림(89.95%가 90.0%로 올림되어 합격하는 경계 오판 방지).
export function calcOcrMatchRate(expected: string, recognized: string): number {
  const a = Array.from(normalizeOcrText(expected));
  const b = Array.from(normalizeOcrText(recognized));
  const longest = Math.max(a.length, b.length);
  if (longest === 0 || a.length === 0) return 0;

  const distance = levenshtein(a, b);
  return Math.floor(((longest - distance) * 1000) / longest) / 10;
}

export function matchOcrText(expected: string, recognized: string, threshold = DEFAULT_OCR_PASS_THRESHOLD): OcrMatchResult {
  const rate = calcOcrMatchRate(expected, recognized);
  return {
    rate,
    // 기준 텍스트가 비면 호출 측에서 막지만, 빈값-빈값 합격은 여기서도 절대 나오지 않게 한다.
    passed: normalizeOcrText(expected).length > 0 && rate >= threshold,
    normalizedExpected: normalizeOcrText(expected),
    normalizedRecognized: normalizeOcrText(recognized)
  };
}

export type OcrDiffChar = { char: string; diff: boolean };

const MAX_ALIGN_CELLS = 250_000;

// 정규화된 두 문자열을 편집거리 역추적으로 정렬해 서로 다른 글자에 diff 표시를 붙인다(관리자 화면 강조용).
export function diffOcrText(expected: string, recognized: string): { expected: OcrDiffChar[]; recognized: OcrDiffChar[] } {
  const a = Array.from(normalizeOcrText(expected));
  const b = Array.from(normalizeOcrText(recognized));

  if ((a.length + 1) * (b.length + 1) > MAX_ALIGN_CELLS) {
    return {
      expected: a.map((char) => ({ char, diff: false })),
      recognized: b.map((char) => ({ char, diff: false }))
    };
  }

  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const left: OcrDiffChar[] = [];
  const right: OcrDiffChar[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      const same = a[i - 1] === b[j - 1];
      left.push({ char: a[i - 1], diff: !same });
      right.push({ char: b[j - 1], diff: !same });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      left.push({ char: a[i - 1], diff: true });
      i -= 1;
    } else {
      right.push({ char: b[j - 1], diff: true });
      j -= 1;
    }
  }

  return { expected: left.reverse(), recognized: right.reverse() };
}
