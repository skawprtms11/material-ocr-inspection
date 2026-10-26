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

// 검수 텍스트 상한(1000자) 양쪽이 통째로 달라도 정렬할 수 있는 크기(1001 × 1001 셀).
const MAX_ALIGN_CELLS = 1_002_001;

// 정규화된 두 문자열을 편집거리 역추적으로 정렬해 서로 다른 글자에 diff 표시를 붙인다(관리자 화면 강조용).
// 앞뒤 공통 구간은 먼저 잘라 일치로 표시하고, 가운데 구간만 정렬한다. 가운데 구간이 상한을 넘으면 그 구간 전체를 diff로 표시한다.
export function diffOcrText(expected: string, recognized: string): { expected: OcrDiffChar[]; recognized: OcrDiffChar[] } {
  const a = Array.from(normalizeOcrText(expected));
  const b = Array.from(normalizeOcrText(recognized));

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const same = (chars: string[]) => chars.map((char) => ({ char, diff: false }));
  const head = { a: same(a.slice(0, prefix)), b: same(b.slice(0, prefix)) };
  const tail = { a: same(a.slice(a.length - suffix)), b: same(b.slice(b.length - suffix)) };
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const middle =
    (midA.length + 1) * (midB.length + 1) > MAX_ALIGN_CELLS
      ? {
          expected: midA.map((char) => ({ char, diff: true })),
          recognized: midB.map((char) => ({ char, diff: true }))
        }
      : alignOcrChars(midA, midB);

  return {
    expected: [...head.a, ...middle.expected, ...tail.a],
    recognized: [...head.b, ...middle.recognized, ...tail.b]
  };
}

// 편집거리 표를 만들고 역추적해 두 글자 배열을 정렬한다.
function alignOcrChars(a: string[], b: string[]): { expected: OcrDiffChar[]; recognized: OcrDiffChar[] } {
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
