# 유통가공관리시스템 업무용 UI 리디자인 설계서

- **최종 결정: 주색 클로드 주황 계열(2026-10-31)**. 아래 남색(`#0f1f3d`)·blue-600 기술은 구버전이며, 색 값은 1장과 실제 `app/globals.css`를 기준으로 함. 결정 필요 사항 4건의 결과는 문서 끝에 기록함
- 작성: architect-team / 2026-10-31 / 대상 커밋 `142e4e4`(main)
- 성격: **설계 문서(코드 미수정)**. 개발팀(A/B/C 묶음)과 검수팀이 이 문서 기준으로 작업·검수함
- 원칙: **기능 100% 동일**. 기존 export 이름, props, 상태 로직, aria-label, data-testid, 이벤트 핸들러는 변경 금지. 바꾸는 것은 className, 장식 문구, 장식 아이콘뿐임
- 기준: shadcn/ui(MIT) 토큰·컴포넌트 스타일, 관리자 레이아웃은 satnaing/shadcn-admin 참고, 폰트 Pretendard(OFL)
- 등장 횟수는 2026-10-31 기준 `app/**`, `components/**`의 `.tsx` 파일(api 제외)을 grep으로 센 값임

---

## 0. 결론 요약

- 토큰: shadcn 변수 체계(`--background`, `--primary` 등)를 `app/globals.css`에 넣고 Tailwind v4 `@theme inline`으로 연결함. primary는 `#b85a3a`(클로드 주황 계열, 최종 결정), 사이드바는 따뜻한 짙은 회색 `#262523`(선택 메뉴만 주황), radius는 `0.5rem`
- 폰트: npm `pretendard`의 **dynamic-subset CSS를 `app/layout.tsx`에서 import하는 방식을 권장**함(next/font/local은 대안)
- 굵기: 400/500/600 세 단계만 사용함. `font-black` 427곳 중 제목은 `font-semibold`, 나머지는 `font-medium`으로 바꿈
- 공통 부품 11종은 **className만 교체**함(props와 export 유지). 호출부는 수정하지 않아도 동작함
- 인라인 모달 23개(일반 22 + Lightbox 1): **공통 컴포넌트로 추출하지 않음**. 문서에 정한 클래스 문자열로 일괄 치환함(동작 리스크 최소)
- 작업 분할: A(토큰·공통·셸) / B1(작업흐름 웹) / B2(마스터 웹) / C(모바일·인쇄). 묶음 간 파일 중복 없음. 인원이 3명이면 B1과 B2를 합침
- 주요 리스크: 상태 색이 의미를 갖는 조건부 className 17곳, `rounded-full` 기계 치환 금지, twMerge 충돌, 인쇄 양식 폰트 변경으로 인한 페이지 넘침

---

## 1. 디자인 토큰

### 1-1. 색 체계

| 토큰 | 값 | 용도 |
|---|---|---|
| `--background` | `#f6f5f2` | 페이지 바탕(웹·모바일 공통) |
| `--foreground` | `#1f1e1c` | 기본 글자(따뜻한 검정) |
| `--card` / `--card-foreground` | `#ffffff` / `#1f1e1c` | 카드, 팝업 패널, 상단바 |
| `--popover` / `--popover-foreground` | `#ffffff` / `#1f1e1c` | 드롭다운 메뉴, listbox |
| `--primary` / `--primary-foreground` | `#b85a3a` / `#ffffff` | 주 버튼, 활성 탭, 링크 |
| `--secondary` / `--secondary-foreground` | `#f1efea` / `#2b2a27` | 보조 버튼 바탕 |
| `--muted` / `--muted-foreground` | `#f1efea` / `#6b6760` | 표 헤더 바탕, 보조 설명 글자 |
| `--accent` / `--accent-foreground` | `#fbf1ec` / `#9a4a2e` | 선택 행, hover, 선택된 옵션 |
| `--destructive` / `--destructive-foreground` | `#dc2626` / `#ffffff` | 삭제, 반려, 오류 |
| `--success` / `--success-foreground` | `#16a34a` / `#ffffff` | 합격, 승인, 완료 |
| `--warning` / `--warning-foreground` | `#d97706` / `#ffffff` | 보류, 확인요청, 주의 |
| `--border` | `#e6e2db` | 카드·표·구분선 |
| `--input` | `#d5d0c7` | 입력창·select 테두리(border보다 진하게 해서 입력 영역이 잘 보이게 함) |
| `--ring` | `#d97757` | 포커스 링 |
| `--sidebar` | `#262523` | 사이드바 바탕(따뜻한 짙은 회색) |
| `--sidebar-foreground` | `#c9c4bb` | 사이드바 기본 글자 |
| `--sidebar-primary` / `--sidebar-primary-foreground` | `#b85a3a` / `#ffffff` | 활성 메뉴, 로고 박스 |
| `--sidebar-accent` / `--sidebar-accent-foreground` | `#34322f` / `#ffffff` | 메뉴 hover |
| `--sidebar-border` | `#3a3835` | 사이드바 구분선 |
| `--sidebar-ring` | `#d97757` | 사이드바 포커스 |

- 주색 원칙: 주황 원색(`#d97757`)은 포커스 링·아이콘에만 쓰고, 버튼·활성 메뉴는 흰 글자 대비 4.6:1인 `#b85a3a`를 씀. 넓은 면은 따뜻한 무채색으로 둠
- 사이드바 흰색 대안(미채택)은 변수 5개만 교체하면 되며 컴포넌트 수정은 없음
- 상태 색(합격·반려 등)은 토큰으로 묶지 않고 Tailwind 팔레트(emerald/red/amber/orange/indigo/slate/blue)를 그대로 씀. 의미 구분이 중요하고 기존 코드가 이미 팔레트 클래스로 분기하기 때문임(1-6, 2-8 참고)

### 1-2. 라운드·그림자·간격

| 항목 | 규칙 |
|---|---|
| radius | `--radius: 0.5rem`. `rounded-sm`=4px, `rounded-md`=6px, `rounded-lg`=8px, `rounded-xl`=12px |
| 카드·팝업·표 외곽 | `rounded-lg` |
| 버튼·입력창·select·배지·알림 박스 | `rounded-md` |
| 원형 유지 | 아바타, 아이콘 원, 진행바, 토글 스위치, ROI 핸들, 상태 점(`size-*` 정사각형) → `rounded-full` 유지 |
| 그림자 | 카드 `shadow-xs`, 드롭다운 `shadow-md`, 팝업 `shadow-lg`. 색 그림자(`shadow-sky-*`)와 임의 그림자는 쓰지 않음 |
| 반투명·블러 | `backdrop-blur`, `bg-white/NN` 유리 효과 사용 안 함(이미지 위 오버레이는 예외) |
| 페이지 여백 | 웹 `px-4 py-6 md:px-6`, 모바일 `px-4 pt-4 pb-28` |
| 카드 안쪽 여백 | `p-5`(기존 유지). 표가 들어간 카드는 `p-0` + 헤더 `px-5 py-4` |
| 섹션 간격 | `space-y-4`(웹), `space-y-3`(모바일) |
| 표 셀 | 웹 `px-4 py-2.5`(행 높이 약 40px, 업무용 밀도), 헤더 `h-10 px-4` |

### 1-3. 글자 크기·굵기 체계

굵기는 400(normal), 500(medium), 600(semibold) **세 단계만** 씀. 700 이상(`font-bold`, `font-extrabold`, `font-black`)은 웹·모바일 UI에서 사용하지 않음(인쇄 양식 `print.css`는 예외).

| 용도 | 웹 클래스 | 모바일 클래스 |
|---|---|---|
| 페이지 제목(h1) | `text-xl font-semibold tracking-tight text-foreground` | `text-lg font-semibold text-foreground` |
| 섹션·카드 제목(h2) | `text-base font-semibold text-foreground` | `text-base font-semibold` |
| 소제목(h3), 폼 그룹 제목 | `text-sm font-semibold text-foreground` | 동일 |
| 상단 분류 표기(eyebrow, 기존 `text-xs font-black text-sky-600`) | `text-xs font-medium text-muted-foreground` | 동일 |
| 본문 | `text-sm text-foreground` | `text-sm` |
| 보조 설명 | `text-sm text-muted-foreground` 또는 `text-xs text-muted-foreground` | 동일 |
| 폼 라벨 | `text-sm font-medium text-foreground` | `text-xs font-medium text-muted-foreground` |
| 표 헤더 | `text-xs font-medium text-muted-foreground` | - |
| 표 셀 강조값(코드, 문서번호) | `font-medium text-foreground` | - |
| KPI 숫자 | `text-2xl font-semibold tabular-nums` | `text-xl font-semibold tabular-nums` |
| 배지 | `text-xs font-medium` | `text-[11px] font-medium` |
| 버튼 | `text-sm font-medium` | 동일 |
| 최소 글자 | `text-xs`(12px) | `text-[11px]`. `text-[10px]`는 `text-[11px]`로 올림. 썸네일 위 `text-[9px]`만 예외로 유지 |

- 숫자 열(작업수량, 건수, 일치율)에는 `tabular-nums text-right`를 적용함(사내 규칙: 표 안 숫자 오른쪽 정렬). 헤더 `th`에도 같은 열에 `text-right`를 붙임
- **커스텀 font-size 토큰(`--text-caption` 등)은 만들지 않음**. twMerge가 `text-caption`을 색으로 판단해 `text-slate-700` 같은 클래스와 충돌 처리하면서 크기 클래스가 사라질 수 있음

### 1-4. `app/globals.css` 초안(전체 교체본)

```css
@import "tailwindcss";

/* 유통가공관리시스템 디자인 토큰 — shadcn/ui 변수 체계 */
:root {
  color-scheme: light;
  --radius: 0.5rem;

  /* 주색: 클로드 로고 주황(#D97757) 계열. 흰 글자 대비 4.5:1을 넘기도록 한 단계 어둡게 쓰고(#B85A3A),
     원색은 포커스 링·아이콘에만 쓴다. 넓은 면은 따뜻한 무채색으로 두어 주황이 튀지 않게 한다. */
  --background: #f6f5f2;
  --foreground: #1f1e1c;
  --card: #ffffff;
  --card-foreground: #1f1e1c;
  --popover: #ffffff;
  --popover-foreground: #1f1e1c;
  --primary: #b85a3a;
  --primary-foreground: #ffffff;
  --secondary: #f1efea;
  --secondary-foreground: #2b2a27;
  --muted: #f1efea;
  --muted-foreground: #6b6760;
  --accent: #fbf1ec;
  --accent-foreground: #9a4a2e;
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --success: #16a34a;
  --success-foreground: #ffffff;
  --warning: #d97706;
  --warning-foreground: #ffffff;
  --border: #e6e2db;
  --input: #d5d0c7;
  --ring: #d97757;

  /* 사이드바: 남색 대신 따뜻한 짙은 회색, 선택 메뉴만 주황 */
  --sidebar: #262523;
  --sidebar-foreground: #c9c4bb;
  --sidebar-primary: #b85a3a;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #34322f;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #3a3835;
  --sidebar-ring: #d97757;
}

@theme inline {
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui,
    "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    box-sizing: border-box;
    border-color: var(--color-border);
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    min-height: 100vh;
    margin: 0;
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    font-feature-settings: "tnum" 0;
    -webkit-font-smoothing: antialiased;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  ::selection {
    background: #f6d5c7;
    color: #1f1e1c;
  }
}

/* 브라우저 기본 화살표 대신 공통 화살표로 통일한다(자체 아이콘을 얹는 select는 appearance-none 클래스로 제외).
   레이어 밖에 둬서 px-* 유틸리티가 오른쪽 여백을 덮어써 화살표와 글자가 겹치지 않게 한다. */
select:not(.appearance-none):not([multiple]) {
  appearance: none;
  padding-right: 2rem;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.625rem center;
  background-size: 1rem;
}
```

- 기존 `.cloud-dots` 클래스는 사용처 0건이라 삭제함
- `* { border-color }`: Tailwind v4는 색을 지정하지 않은 `border`의 기본색이 `currentColor`임. shadcn처럼 기본색을 `--border`로 고정하면 색 미지정 테두리가 회색으로 바뀜(의도된 개선). ROI 박스처럼 테두리 색이 의미를 갖는 곳은 모두 색을 명시하고 있어 영향 없음

### 1-5. Pretendard 적용 방법

| 방식 | 장점 | 단점 |
|---|---|---|
| **A. npm `pretendard` dynamic-subset CSS import(권장)** | 실제로 쓰인 글자 묶음(unicode-range)만 내려받아 모바일 현장 네트워크에 유리함. Next가 woff2를 `_next/static/media`로 자체 호스팅해 외부 CDN 의존이 없음. 굵기 45~920 가변 폰트 하나로 처리 | 첫 렌더에서 폰트 교체 깜빡임(FOUT)이 조금 있음. 빌드 산출물에 woff2 조각 파일이 많이 생김 |
| B. `next/font/local`(`PretendardVariable.woff2`) | preload와 size-adjust fallback으로 레이아웃 흔들림이 적음 | 파일 1개가 약 2MB라 모바일 첫 진입 부담이 큼. 서브셋을 직접 나누려면 관리 비용이 듦 |

권장안(A) 적용 절차:
1. `npm i pretendard`(A 묶음에서 실행. `package.json`, `package-lock.json` 변경)
2. `app/layout.tsx` 최상단에 `import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";` 추가(`./globals.css` import보다 위). globals.css 안에서 `@import`로 불러오면 폰트 `url()` 상대경로가 깨질 수 있으므로 쓰지 않음
3. 폰트 패밀리는 globals.css의 `--font-sans`로 지정(위 초안 반영)
4. 인쇄: `components/documents/print.css:4`의 `.doc-root` font-family 앞에 `"Pretendard Variable", Pretendard,`만 추가함(8번 리스크 참고). 인쇄 페이지는 이미 `document.fonts.ready`를 기다린 뒤 `window.print()`를 호출하므로(`app/print/work-order/[workId]/page.tsx:77`) 추가 처리는 필요 없음

### 1-6. 의미 색 고정 규칙

| 의미 | 팔레트 | 비고 |
|---|---|---|
| 주 동작, 진행, 정보 | blue(=primary) | 기존 sky는 모두 blue로 바꿈 |
| 대기·중립·미제출 | slate | |
| 합격·승인·완료 | emerald | 최종 완료(`completed`)만 채운 배지(solid) |
| 보류·확인요청·주의 | amber | |
| 재검수 | orange | |
| 불합격·반려·삭제·오류 | red | 기존 rose는 같은 단계의 red로 바꿈 |
| 사진 승인대기 | indigo | blue와 구분되도록 ring을 유지함 |
| **비전(VISION) 방식, 부자재 구분** | violet | OCR=blue, VISION=violet 구분은 유지함. 장식용 violet은 제거함 |

---

## 2. 공통 부품 리디자인 명세

공통 규칙:
- export 이름, props 타입, 기본값, `cn()` 병합 순서(`base → tone → className`)는 그대로 둠
- 장식 아이콘(Cloud, Sparkles)만 업무형 아이콘으로 바꿈. lucide-react만 사용함
- 포커스 표기: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`
- disabled 표기: `disabled:cursor-not-allowed disabled:opacity-50`(기존 유지). `disabled:pointer-events-none`은 쓰지 않음. 비활성 버튼에 `title`로 사유를 보여주는 곳이 있음(`work-inspection/page.tsx:374` "완료단계 사진이 제출되면 승인할 수 있습니다.")

### 2-1. `components/common/CloudButton.tsx`

- base: `inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50`
  - `min-h-10`(40px)은 유지함. 모바일 터치 영역과 기존 레이아웃을 보존하기 위함
  - `[&_svg]:size-4`는 넣지 않음. 호출부의 `size-5` 아이콘과 `Loader2`가 강제로 16px로 바뀜
- tones(이름 5종 유지):

| tone | 새 클래스 | 사용 맥락 |
|---|---|---|
| primary | `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90` | 등록, 저장, 출력 |
| soft | `border border-input bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground` | 취소, 수정, 보조 동작(shadcn outline) |
| danger | `border border-red-200 bg-red-50 text-red-700 hover:bg-red-100` | 삭제, 반려 |
| success | `border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100` | 승인, 합격 처리 |
| warning | `border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100` | 상세필터 적용 중 표시(`work-status/page.tsx:311`) 등 |

### 2-2. `components/common/CuteCard.tsx`

- className: `rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xs`
- motion: `"use client"`와 `motion.div`는 유지함(서버 컴포넌트 `ImageUploadCard`가 import함). `initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}`로 줄임. 위로 떠오르는 효과(`y: 12`)는 제거함
- `hover` prop: 타입은 유지함. `whileHover`는 제거하고, `hover`가 true이면 `transition-shadow hover:shadow-md`를 붙임
- 호출부에서 `bg-violet-50/70`, `bg-gradient-*`처럼 바탕을 덮어쓰는 className은 B/C 묶음이 정리함(5장 규칙)

### 2-3. `components/common/DataTable.tsx`

- 외곽: `overflow-x-auto rounded-lg border border-border bg-card`(기존 `overflow-hidden`은 `min-w-[720px]` 표를 잘라냈음. 가로 스크롤 허용으로 개선)
- table: `w-full min-w-[720px] text-left text-sm`(유지)
- thead: `bg-muted/60 text-xs font-medium text-muted-foreground`(`uppercase` 제거)
- th: `h-10 whitespace-nowrap px-4 align-middle`
- tbody: `divide-y divide-border`
- tr: `text-foreground transition-colors hover:bg-muted/40`
- td: `px-4 py-2.5 align-middle`

### 2-4. `components/common/PageHeader.tsx`

- "fluffy workflow" 배지와 `Sparkles`를 삭제함
- 외곽: `mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between`
- h1: `text-xl font-semibold tracking-tight text-foreground`
- p: `mt-1 max-w-3xl text-sm text-muted-foreground`
- action 래퍼는 추가하지 않음(호출부가 이미 flex 묶음을 넘김)

### 2-5. `components/common/StatusBadge.tsx`

- base: `inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset`
- toneMap 매핑:

| key | 라벨 | 현재 | 새 클래스 |
|---|---|---|---|
| registered | 대기 | sky-100 | `bg-slate-100 text-slate-700 ring-slate-500/20` |
| in_progress | 진행 | violet-100 | `bg-blue-50 text-blue-700 ring-blue-600/20` |
| on_hold | 보류 | amber-100 | `bg-amber-50 text-amber-800 ring-amber-600/20` |
| canceled | 취소 | rose-100 | `bg-red-50 text-red-700 ring-red-600/20` |
| inspection_failed | 불합격 | rose-100 | `bg-red-50 text-red-700 ring-red-600/20` |
| admin_review_requested | 검수확인중/완료확인중/작업·완료승인대기 | amber-100 | `bg-amber-50 text-amber-800 ring-amber-600/20` |
| passed | 합격 | emerald-100 | `bg-emerald-50 text-emerald-700 ring-emerald-600/20` |
| completed | 완료 | teal-100 | `bg-emerald-600 text-white ring-emerald-600`(최종 상태만 채운 배지) |
| pending | 대기 | slate-100 | `bg-slate-100 text-slate-700 ring-slate-500/20` |
| failed | 불합격 | rose-100 | `bg-red-50 text-red-700 ring-red-600/20` |
| retrying | 재검수 | orange-100 | `bg-orange-50 text-orange-700 ring-orange-600/20` |
| admin_requested | 관리자 요청 | amber-100 | `bg-amber-50 text-amber-800 ring-amber-600/20` |
| admin_approved | 관리자 승인 | emerald-100 | `bg-emerald-50 text-emerald-700 ring-emerald-600/20` |
| requested | 확인 요청 | amber-100 | `bg-amber-50 text-amber-800 ring-amber-600/20` |
| approved | 수동 합격 | emerald-100 | `bg-emerald-50 text-emerald-700 ring-emerald-600/20` |
| retry_requested | 재검수 요청 | orange-100 | `bg-orange-50 text-orange-700 ring-orange-600/20` |
| rejected | 반려/불합격 유지 | rose-100 | `bg-red-50 text-red-700 ring-red-600/20` |
| submitted | 승인대기 | indigo-100 | `bg-indigo-50 text-indigo-700 ring-indigo-600/20` |

- `registered` 색을 sky에서 slate로 바꾸는 이유: 웹 작업현황(`work-status/page.tsx:66` waiting=slate)과 맞추기 위함. 같은 "대기"가 화면마다 다른 색으로 보이던 불일치가 해소됨
- 같은 형식(`bg-X-50 text-X-700 ring-X-600/20`, `ring-inset`, `rounded-md`)을 화면별 로컬 맵에도 똑같이 적용함(2-8 참고)

### 2-6. `components/common/EmptyCloudState.tsx`

- export 이름과 props(`title?`, `description?`)는 유지함
- 기본 문구: title `"부서와 화주를 선택하세요."`, description `"상단 필터에서 부서와 화주를 선택하면 해당 범위의 업무 데이터가 표시됩니다."`
- 아이콘: `Cloud`와 `Sparkles`를 `ListFilter` 1개로 바꿈
- 외곽: `flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center`
- 아이콘 원: `mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground`(아이콘 `size-6`)
- title: `text-base font-semibold text-foreground` / description: `mt-1.5 max-w-md text-sm text-muted-foreground`

### 2-7. `components/common/ImageUploadCard.tsx`

- CuteCard className `bg-gradient-to-br from-white to-sky-50/70`를 삭제함(기본 카드 사용)
- 제목 `font-semibold text-foreground`, 버킷 표기 `text-xs text-muted-foreground`
- 아이콘 원 `rounded-md bg-accent p-2 text-primary`
- 업로드 영역: `flex aspect-[5/3] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-input bg-muted/30 text-center text-sm text-muted-foreground hover:bg-muted/50`
- 문구 "기준 이미지 또는 촬영 이미지를 올려요"를 "기준 이미지 또는 촬영 이미지를 업로드합니다"로 바꿈

### 2-8. 화면 로컬 상태 색 맵(B·C 묶음 담당, 같은 형식 적용)

| 파일:라인 | 맵 | 변경 |
|---|---|---|
| `app/(workspace)/work-status/page.tsx:60-93` | `displayStatusMeta` badge/iconBox | badge는 2-5 형식으로 바꿈. iconBox `bg-sky-500`→`bg-primary`, `bg-amber-400`→`bg-amber-500`, `bg-rose-500`→`bg-red-500`, 그 외 유지 |
| `app/(workspace)/work-status/page.tsx:269-274` | KPI 카드 tone | `text-sky-600 bg-sky-100`→`text-blue-700 bg-blue-50`, rose→red |
| `app/(workspace)/work-status/page.tsx:525-531` | `materialStatusMeta` | 2-5 형식으로 바꿈. adminRequest=orange, submitted=indigo 유지 |
| `app/(workspace)/work-inspection/page.tsx:22-27` | 조정확인 맵 | 2-5 형식으로 바꿈. retry_requested는 sky→blue |
| `app/(workspace)/work-inspection/page.tsx:41-51` | `getStepClassName` | **문자열 includes 순서는 바꾸지 않음**. 색만 바꿈: rose→red, sky→blue, `X-100`→`X-50 ring-1 ring-inset ring-X-600/20` |
| `app/(workspace)/work-inspection/PhotoApprovalModal.tsx:38-43` | 사진 상태 맵 | 2-5 형식으로 바꿈 |
| `app/(workspace)/material-master/page.tsx:42-48` | 기준등록 버튼 상태 | register `bg-sky-500…`→`bg-primary text-primary-foreground hover:bg-primary/90`. complete/incomplete는 2-1 success/warning 톤. unused-registered `ring-1 ring-inset ring-input bg-card text-muted-foreground` |

---

## 2-9. 레이아웃 셸

### `components/layout/AppShell.tsx`

- 루트: `min-h-screen bg-background text-foreground`(radial 그라데이션 제거)
- main: `mx-auto w-full max-w-[96rem] px-4 py-6 md:px-6`
- `<Toaster richColors position="top-right" />`는 유지함

### `components/layout/Sidebar.tsx`(따뜻한 짙은 회색, shadcn-admin 구조)

- `menuItems`의 href·label·icon·순서와 `isActive` 판정식(54행)은 그대로 둠
- aside: `sticky top-0 flex h-screen w-16 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:w-20 lg:w-64`
  - 기존 `min-h-screen` 비고정에서 sticky로 바꿈(긴 표를 스크롤해도 메뉴 고정). 높이가 낮은 화면을 위해 `overflow-y-auto`를 붙임
- 로고 영역(Link): `flex h-14 shrink-0 items-center justify-center gap-2.5 border-b border-sidebar-border px-3 lg:justify-start lg:px-4`
  - 로고 박스: `flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground` + lucide `Boxes`(`size-4`)
  - 텍스트(lg 이상): `유통가공관리시스템`(`text-sm font-semibold text-white`) / 보조 `부자재 검수 · 작업관리`(`text-[11px] text-sidebar-foreground/70`)
  - aria-label: `"유통가공관리시스템 홈"`
- 메뉴 그룹 라벨(lg 이상, 선택 사항): 작업등록~작업현황은 `업무`, 작업마스터~문서마스터는 `기준정보`, 사용자관리는 `시스템`. 라벨 클래스 `px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50`. 순서와 href는 유지함
- nav: `flex-1 space-y-0.5 p-2 lg:p-3`
- 메뉴 항목: `flex h-9 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors lg:justify-start lg:px-3`
  - 활성: `bg-sidebar-primary text-sidebar-primary-foreground`
  - 비활성: `text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`
  - 아이콘 래퍼 span(원형 배경)을 없애고 `<Icon className="size-4 shrink-0" />`만 둠
- 모바일 바로가기: `mt-auto` 영역 `border-t border-sidebar-border p-2 lg:p-3` 안에 메뉴 항목과 같은 비활성 클래스를 씀. 라벨 "모바일 검수 바로가기", `title`, href는 유지함. 그라데이션 제거

### `components/layout/TopFilterBar.tsx`

- 로직(useEffect 2개, 스코프 저장)은 수정 금지. JSX className과 130행 문구만 바꿈
- header: `sticky top-0 z-20 border-b border-border bg-card px-4 py-2.5 md:px-6`(반투명·블러 제거)
- 내부 flex: `flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end`
- 130행 "오늘도 폭신하게 정확히 검수해요"를 `<div className="text-sm font-semibold text-foreground lg:hidden">유통가공관리시스템</div>`로 바꿈(사이드바가 접히는 lg 미만 너비에서만 시스템명 노출)
- select 2개: `h-9 min-w-44 appearance-none rounded-md border border-input bg-card px-3 pr-9 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50`(부서와 화주 모두 같은 클래스. violet 테두리 제거)
- ChevronDown: `pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground`(높이가 바뀌므로 `top-3`을 쓰지 않음)
- 사용자 칩: `flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3` / 아바타 `flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary` / 이름 `text-xs font-semibold text-foreground` / 역할 `text-[11px] text-muted-foreground`

### `components/mobile/MobileShell.tsx`

- navItems와 active 판정식(44행)은 유지함
- 루트: `min-h-screen bg-background text-foreground`(linear 그라데이션 제거)
- header: `sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4`
  - 브랜드 Link: `flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground` + 로고 박스 `flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar text-white`(`Boxes size-4`) + `<span className="truncate">유통가공관리시스템</span>`. 기존 "모바일 업무"와 `Cloud`는 제거함
  - 웹 이동 버튼: `inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted`(aria-label 유지)
- main: `pb-28 pt-4`(나머지 유지. `min-h-[calc(100vh-57px)]`는 `100vh-56px`로 바꿈)
- 하단 nav: `fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5`(그림자·블러 제거)
  - 항목: `flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors`
  - 활성: `text-primary bg-accent` / 비활성: `text-muted-foreground hover:text-foreground`
- `<Toaster richColors position="top-center" />` 유지

### `components/mobile/MobileScopeBadge.tsx`(셸 일부로 A 묶음 소속)

- sky 배지를 `rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground`로 바꿈. 문구와 로직은 유지함

---

## 3. 팝업 공통 규칙

### 3-1. 현재 인라인 모달 목록(`fixed inset-0` 23곳 = 일반 모달 22 + Lightbox 1)

| # | 파일:오버레이 라인 | 컴포넌트 | 정렬 | 패널 폭 | role=dialog |
|---|---|---|---|---|---|
| 1 | `app/(workspace)/work-register/page.tsx:624` | WorkRegisterModal(등록/수정 공용) | center | 7xl | 없음 |
| 2 | `app/(workspace)/work-register/page.tsx:961` | WorkDetailModal | center | 6xl | 없음 |
| 3 | `app/(workspace)/work-register/WorkOrderModal.tsx:149` | WorkOrderModal | center | 5xl | 없음 |
| 4 | `app/(workspace)/work-status/page.tsx:582` | WorkDetailModal(상세내역) | start | 4xl | 없음 |
| 5 | `app/(workspace)/work-status/page.tsx:956` | DetailFilterModal | center | 4xl | 없음 |
| 6 | `app/(workspace)/work-inspection/page.tsx:452` | OcrCompareModal | center | 4xl | 없음 |
| 7 | `app/(workspace)/work-inspection/page.tsx:534` | AdjustmentReviewModal | center | 5xl | 없음 |
| 8 | `app/(workspace)/work-inspection/PhotoApprovalModal.tsx:196` | PhotoApprovalModal | center, flex-col max-h-full | 5xl | 없음 |
| 9 | `app/(workspace)/work-inspection/PhotoApprovalModal.tsx:583` | Lightbox(z-60, 검은 바탕) | center | 이미지 | 있음 |
| 10 | `app/(workspace)/work-master/page.tsx:628` | WorkMaterialModal | center | 5xl | 없음 |
| 11 | `app/(workspace)/work-master/page.tsx:830` | ProductCodeModal | center | 5xl | 없음 |
| 12 | `app/(workspace)/work-master/page.tsx:1025` | BatchRegisterModal | center | 6xl | 없음 |
| 13 | `app/(workspace)/material-master/page.tsx:397` | MaterialEditorModal | start | 3xl | 없음 |
| 14 | `app/(workspace)/material-master/page.tsx:538` | MaterialImagePreviewModal | start | 4xl | 없음 |
| 15 | `app/(workspace)/material-master/ReferenceRegisterModal.tsx:216` | ReferenceRegisterModal | start | 4xl | 있음 |
| 16 | `app/(workspace)/material-master/ReferenceDetailModal.tsx:125` | ReferenceDetailModal | start | 3xl | 있음 |
| 17 | `app/(workspace)/department-master/page.tsx:143` | AddDepartmentModal | center | md | 있음 |
| 18 | `app/(workspace)/shipper-master/page.tsx:235` | AddShipperModal | center | md | 있음 |
| 19 | `app/(workspace)/shipper-master/page.tsx:310` | CrewLeaderModal | center | 3xl | 없음 |
| 20 | `app/(workspace)/users/page.tsx:172` | PermissionModal | center | 2xl | 있음 |
| 21 | `app/(workspace)/document-master/TemplateFormModal.tsx:36` | TemplateFormModal | start | 6xl | 없음 |
| 22 | `app/(workspace)/document-master/TemplatePickerModal.tsx:87` | TemplatePickerModal | center | 2xl | 없음 |
| 23 | `app/(workspace)/document-master/TemplatePreviewModal.tsx:25` | TemplatePreviewModal | center | fit | 없음 |

- 모바일(`app/mobile/**`)에는 오버레이 모달이 없음. 대신 화면 전환과 카드 안 확장 패널을 씀(4장 참고)
- 현재 오버레이 클릭으로 닫기와 ESC 닫기는 없음(예외: TemplatePickerModal ESC, Lightbox ESC/좌우키). **이번 작업에서 추가하지 않음**(입력 중 실수로 닫혀 데이터가 사라질 위험이 있고, 기능 변경에 해당함)

### 3-2. 공통 스타일(치환 문자열)

| 부위 | 현재(대표) | 새 클래스 |
|---|---|---|
| 오버레이 | `bg-slate-950/35 … backdrop-blur-sm` | `bg-slate-950/50`로 바꾸고 `backdrop-blur-sm` 삭제. `items-start`/`items-center`, `overflow-y-auto px-4 py-8`은 **파일별 기존값 유지** |
| 패널 | `rounded-[1.5rem]`(또는 `[1.4rem]`) `border border-white/80 bg-[#f8fbff] … shadow-[0_24px_80px_rgba(15,23,42,0.22)]` | `rounded-lg border border-border bg-card … shadow-lg`. `w-full max-w-*`와 `p-5`는 유지 |
| 헤더 래퍼 | `mb-5 flex items-start justify-between gap-4` | 뒤에 `border-b border-border pb-4`를 붙임 |
| 헤더 eyebrow | `text-xs font-black text-sky-600`(violet/indigo 변형 포함) | `text-xs font-medium text-muted-foreground` |
| 헤더 제목 | `mt-1 text-2xl font-black text-slate-800` | `mt-1 text-lg font-semibold text-foreground` |
| 헤더 설명 | `mt-2 text-sm font-semibold text-slate-500` | `mt-1 text-sm text-muted-foreground` |
| 닫기 버튼(22곳 같은 문자열) | `inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50` | `inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`. 안의 `X`는 `size-5`→`size-4`. aria-label 유지 |
| 본문 소제목 | `text-sm font-black text-slate-800` | `text-sm font-semibold text-foreground` |
| 본문 내부 표 박스 | `rounded-[1.2rem] border border-white/80 bg-white/75` | `rounded-md border border-border bg-card` |
| 푸터(버튼만 담긴 `grid grid-cols-2 gap-2`) | 반반 꽉 찬 버튼 | `mt-5 flex justify-end gap-2 border-t border-border pt-4`. 버튼 순서(취소 왼쪽, 주 동작 오른쪽)는 유지하고, 각 버튼에 `min-w-24` 정도를 붙임 |
| 인라인 알림 박스 | `rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700` | `rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700`(amber·emerald도 같은 형식) |
| Lightbox(#9) | `bg-slate-950/80` | 그대로 유지. 버튼 `bg-white/90 rounded-full`도 이미지 위 컨트롤이라 유지 |

### 3-3. 공통 컴포넌트 추출 여부 권고

- **권고: 추출하지 않고 클래스만 치환함**
- 이유:
  1. 23개 모달마다 정렬(start/center), 폭, PhotoApprovalModal의 flex-col 스크롤 구조, form 래핑 위치가 달라 공통 `Dialog`로 감싸면 DOM 구조가 바뀜. 스크롤과 포커스 회귀 위험이 큼
  2. B1·B2·C가 병렬로 작업하므로 새 공통 파일에 의존하면 A 완료를 기다려야 함. 문자열 치환은 바로 병렬 진행이 가능함
  3. 이번 목표는 시각 변경이며, 동작(ESC, 포커스 트랩)을 바꾸는 작업은 범위 밖임
- 후속 과제(이번 범위 밖, 대표님 별도 승인 필요): shadcn `Dialog`(Radix) 도입으로 포커스 트랩과 ESC 닫기를 표준화함. 이때 모든 모달에 `role="dialog" aria-modal`을 함께 정리함
- 푸터 `grid grid-cols-2 gap-2`(전체 17곳)는 **모달 푸터에만** 적용함. 폼 입력 2열 그리드도 같은 문자열이므로 기계적으로 일괄 치환하지 않음. 자식이 CloudButton 2개인지 확인한 뒤 바꿈

---

## 4. 전수 인벤토리(화면·팝업·드로어)

검수팀은 아래 순서로 하나씩 열어 확인함. 공통 전제: 웹은 상단 필터에서 부서와 화주를 선택해야 함(미선택이면 EmptyCloudState만 표시). 실DB 모드에서 조회가 실패하면 "연결 오류" 배지와 "다시 시도" 버튼 화면도 함께 확인함(오류 재현은 env를 잘못 넣어 확인).

### 4-1. 웹 화면(`app/(workspace)`)

| ID | 경로 | 파일 | 열기 조건 | 확인 포인트 |
|---|---|---|---|---|
| W0 | `/`, `/dashboard` | `app/page.tsx`, `app/(workspace)/dashboard/page.tsx` | 없음 | `/work-register`로 리다이렉트만 함(UI 없음) |
| W1 | `/work-register` | `work-register/page.tsx` | 부서+화주 선택(202행) | 출력 필터 탭(미출력/출력완료/전체), 데이터 소스 배지, 목록 표, 빈 목록 문구 |
| W2 | `/work-inspection` | `work-inspection/page.tsx` | 부서+화주(93행) | 확인요청 섹션(대기 요청이 있을 때만), 사진 승인대기 섹션(`photoApprovalQueue`>0), 목록 표, 단계 배지 색 |
| W3 | `/work-status` | `work-status/page.tsx` | 부서+화주(224행) | 년·월 select, KPI 6카드, 목록 표, 상태 배지 |
| W4 | `/work-master` | `work-master/page.tsx` | 부서+화주(196행) | 인라인 행 추가·편집 표(select 포함), 전체선택 체크박스 |
| W5 | `/material-master` | `material-master/page.tsx` | 부서+화주(201행) | 목록 행 선택 강조, OCR/비전 기준 버튼 4가지 상태 색 |
| W6 | `/department-master` | `department-master/page.tsx` | 없음(부서 필터 불필요) | DataTable |
| W7 | `/shipper-master` | `shipper-master/page.tsx` | 부서 선택(92행, 미선택이면 전용 빈 화면) | DataTable, 작업조장 인원 버튼, 사용 여부 배지 |
| W8 | `/document-master` | `document-master/page.tsx` | 부서 선택(22행) | 탭 2개(문서양식/화주별양식). TemplateTab, ShipperMappingTab(왼쪽 화주 목록, 오른쪽 양식 목록), DataStatusBar |
| W9 | `/users` | `users/page.tsx` | 없음 | DataTable. "사용자 추가" 버튼은 **핸들러 없음**(현행 유지, 눌러도 동작 없음이 정상) |

### 4-2. 웹 팝업·드로어·메뉴

| ID | 화면 | 팝업(파일:정의 라인 / 오버레이 라인) | 여는 버튼(파일:라인) | 열기 조건·데이터 |
|---|---|---|---|---|
| P1 | W1 | WorkRegisterModal 신규(`work-register/page.tsx:448` / `:624`) | PageHeader "작업 등록"(`:282`) | 작업마스터가 1건 이상 있어야 입력 가능. 구성품 표, 제품 미등록 경고(rose 박스) 확인 |
| P1-c | P1 내부 | `window.confirm`(`:533`) "입력된 OCR 검수 텍스트를 마스터값으로 덮어쓸까요?" | P1의 OCR 텍스트 마스터값 버튼 | OCR 텍스트를 직접 입력해 마스터값과 다를 때만 뜸. 네이티브라 스타일 변경 대상 아님 |
| P2 | W1 | WorkRegisterModal 수정(같은 컴포넌트) | 행의 "수정"(`:367`) | `editLockedReason`이 없는 작업만 활성(검수 시작 전). 잠긴 행은 빨간 사유 문구 확인 |
| P3 | W1 | WorkOrderModal(`WorkOrderModal.tsx` / `:149`) | 행의 "작업지시서"(`:374`) | 화주에 작업지시서 양식 매핑이 있어야 미리보기가 나옴. 없으면 amber 안내와 "문서마스터로 이동" 링크. 양식 선택 라벨의 active 색 확인 |
| P3-w | P3 → 새 창 | 인쇄 화면 R1 | "출력(자동배정)"/"재출력" | `window.open`으로 `/print/work-order/...` 열림(팝업 차단 해제 필요) |
| P4 | W1 | WorkDetailModal(`:922` / `:961`) | 문서번호 링크(`:352`) | 작업 1건 이상 |
| P5 | W2 | OcrCompareModal(`work-inspection/page.tsx:438` / `:452`) | 확인요청 섹션 "비교"(`:226`) | 모바일 OCR 일치율 미달 "관리자 확인요청"이 접수돼 `item.ocr`가 있을 때만 버튼 노출 |
| P6 | W2 | PhotoApprovalModal(`PhotoApprovalModal.tsx:45` / `:196`) | ① 사진 승인대기 섹션 버튼(`page.tsx:301`) ② 목록 "사진 확인"(`:363`) ③ 목록 "완료승인"(`:375`) | ① 현장에서 PHOTO 사진을 제출한 작업 ② PHOTO 검수 행이 있는 작업 ③ 완료단계 사진이 1장 이상 제출돼야 활성(비활성 시 title 툴팁 확인). 잠긴 상태(`photoLockedStatuses`)도 확인 |
| P6-r | P6 내부 | 작업 반려 사유 입력 패널(인라인, `PhotoApprovalModal.tsx:290`) | "작업 반려"(`:340`) | `canRejectWork`(승인대기 사진 존재)일 때만 활성. textarea와 rose 박스 |
| P6-l | P6 내부 | Lightbox(`:570` / `:583`, z-60) | 사진 썸네일 클릭 | 사진 1장 이상. ESC와 좌우 화살표 동작 유지 확인 |
| P7 | W2 | AdjustmentReviewModal(`page.tsx:514` / `:534`) | 조정확인 열 배지 버튼(`:386`) | 행에 관리자 확인요청(`row.request`)이 있을 때만 버튼. 없으면 "요청없음" 회색 배지 |
| P8 | W3 | 상태 변경 드롭다운(`work-status/page.tsx:433`, z-30) | 행의 상태 배지 버튼(`:419`) | 작업 1건 이상. 선택지는 검수 집계 상태에 따라 다름 |
| P9 | W3 | DetailFilterModal(`:925` / `:956`) | "상세필터"(`:311`) | 없음. 필터 적용 후 버튼이 warning 톤으로 바뀌는지 확인 |
| P10 | W3 | WorkDetailModal(`:544` / `:582`) | 문서번호 링크(`:465`) | 작업 1건 이상. 내부에 제품 표, 부자재 표, 사진 셀(PhotoReviewCell), 완료사진 섹션 |
| P11 | W4 | WorkMaterialModal(`work-master/page.tsx:576` / `:628`) | 행 "부자재 n가지"(`:524`, sky 버튼) | 저장된 작업마스터 행 |
| P12 | W4 | ProductCodeModal(`:777` / `:830`) | 행 "제품 n가지"(`:514`, emerald 버튼) | 저장된 작업마스터 행 |
| P13 | W4 | BatchRegisterModal(`:1008` / `:1025`) | "일괄등록"(`:373`) | 없음(붙여넣기 텍스트 파싱 결과 표 확인) |
| P14 | W5 | MaterialEditorModal 등록(`material-master/page.tsx:364` / `:397`) | "등록"(`:210`) | 없음 |
| P15 | W5 | MaterialEditorModal 수정(같은 컴포넌트) | "수정"(`:214`) | 목록에서 부자재 선택(`selectedMaterial`) |
| P15-d | W5 | 삭제(확인창 없음, 즉시 API 호출) | "삭제"(`:218`) | 선택 필요. **테스트 데이터로만 누를 것** |
| P16 | W5 | MaterialImagePreviewModal(`:499` / `:538`) | 부자재명 링크(`:280`) | 기준 이미지가 있으면 ROI 오버레이(OCR=blue, VISION=violet) 확인 |
| P17 | W5 | ReferenceRegisterModal(`ReferenceRegisterModal.tsx` / `:216`) | OCR/비전 열 버튼 상태가 "등록"(`page.tsx:310`·`:313`) 또는 P18의 "재등록"(`page.tsx:340`) | 해당 방식이 마스터에서 체크돼 있어야 함(미사용이면 비활성). 내부 PasteImageInput(붙여넣기·드롭), TouchRegionSelector, OCR 인식 결과, vision 결과 박스 |
| P18 | W5 | ReferenceDetailModal(`ReferenceDetailModal.tsx` / `:125`) | 같은 버튼이 "등록완료"/"보완필요"/"등록완료(미사용)" 상태일 때 | 기준 이미지가 등록된 부자재 |
| P19 | W6 | AddDepartmentModal(`department-master/page.tsx:104` / `:143`) | "부서 추가"(`:56`) | 없음 |
| P20 | W7 | AddShipperModal(`shipper-master/page.tsx:185` / `:235`) | "화주 추가"(`:101`) | 부서 선택 |
| P21 | W7 | CrewLeaderModal(`:292` / `:310`) | 행 "n명" 버튼(`:141`) | 화주 1건 이상. 사용자 토글 색(선택=violet solid)은 의미 표시이므로 primary로 바꿔도 선택/비선택 대비 유지 |
| P22 | W8 탭1 | TemplateFormModal 신규(`TemplateFormModal.tsx` / `:36`) | "양식 등록"(`TemplateTab.tsx:213`) | 레이아웃이 1개 이상(`layouts.length>0`). 내부 유형 선택(layout/editor/shipper-file), BasicLayoutPanel, EditorTemplatePanel·ShipperFileTemplatePanel(준비중 패널), TemplateLoader 검색 |
| P23 | W8 탭1 | TemplateFormModal 수정/개정 | 행 아이콘 버튼(`TemplateTab.tsx:249`·`:253`) | `template_type === "layout"`만 활성. 그 외는 비활성+title "준비 중(추후 정의)" |
| P24 | W8 탭1 | TemplatePreviewModal(`TemplatePreviewModal.tsx` / `:25`) | 행 미리보기 아이콘(`TemplateTab.tsx:245`) | 양식 1건 이상. 안의 DocumentRenderer(인쇄 양식)는 디자인 변경 대상 아님 |
| P24-c | W8 탭1 | `window.confirm` 양식 삭제(`TemplateTab.tsx:108`) | 행 삭제 아이콘 | 네이티브 |
| P25 | W8 탭2 | TemplatePickerModal(`TemplatePickerModal.tsx` / `:87`) | "양식 추가"(`ShipperMappingTab.tsx:238`) | 왼쪽에서 화주 선택. 내부 검색 listbox 드롭다운(`:128`, 키보드 상하·Enter·ESC) |
| P26 | W8 탭2 | TemplatePreviewModal | 행 미리보기 아이콘(`ShipperMappingTab.tsx:270`) | 매핑된 양식 1건 이상 |
| P26-c | W8 탭2 | `window.confirm` 매핑 해제(`ShipperMappingTab.tsx:170`) | 행 해제 아이콘 | 네이티브 |
| P27 | W9 | PermissionModal(`users/page.tsx:110` / `:172`) | 행 "편집"(`:83`) | 사용자 1건 이상. 역할 토글(`:167`, 선택=violet solid) |
| G1 | 전 화면 | TopFilterBar select 2개, 사용자 칩 | - | 부서 변경 시 화주가 첫 항목으로 바뀌는지(로직 회귀 확인) |
| G2 | 전 화면 | Sidebar 활성 표시, lg 미만 접힘(w-16/w-20), 모바일 바로가기 | - | `/dashboard` 진입 시 작업등록이 활성 |
| G3 | 전 화면 | sonner 토스트(우상단, richColors) | 저장·오류 동작 | - |

### 4-3. 모바일 화면(`app/mobile`)

| ID | 경로 | 파일 | 열기 조건 | 화면 안 상태·패널 |
|---|---|---|---|---|
| M0 | 셸 | `components/mobile/MobileShell.tsx` | - | 헤더(시스템명, 스코프 배지, 웹 이동), 하단 탭 4개 활성 색 |
| M1 | `/mobile` | `app/mobile/page.tsx` | 스코프 초기화 완료(MobileScopeInitializer) | 스캔 영역, 문서번호 입력, 오류 안내(rose), 경고·오류 카드와 "다시 시도", 이동 중 로딩 |
| M2 | `/mobile/pre/[workId]` | `app/mobile/pre/[workId]/page.tsx` | 홈에서 상태 "대기"(`registered`) 문서 스캔. 불합격은 재촬영, 승인대기는 읽기 전용(`locked`)으로 진입 | ProductChecklist(체크박스형 또는 PhotoReviewCard형), MaterialInspectionList → OcrInspectionCard(촬영 전/위치조정/크롭 미리보기/판정 결과 합격·미달·판정불가/확인요청 대기), PhotoReviewCard(미제출/승인대기/반려+사유/승인), PhotoReviewSummaryBanner, "작업전 검수 완료" 카드. 진입 불가 상태(보류·취소·완료)면 안내 카드 |
| M2-c | M2 내부 | `window.confirm` + `window.prompt`(`OcrInspectionCard.tsx:246`) | OCR 카드 "확인요청"/"관리자 확인요청" | 네이티브 |
| M3 | `/mobile/complete/[workId]` | `app/mobile/complete/[workId]/page.tsx` | 홈에서 상태 "진행"(`in_progress`) 문서 스캔, 또는 M4의 "완료검수" | CompletionProductPhotoCard(최대 3장, 썸네일 삭제 버튼), CompletionPhotoCard(특이사항 확인요청), "완료 확인하고 나가기". `registered`면 "작업전 검수로 이동" 안내 |
| M3-c | M3 내부 | `window.confirm`(`CompletionProductPhotoCard.tsx:108` 사진 삭제, `CompletionPhotoCard.tsx:139` 특이사항 확인요청) | 각 버튼 | 네이티브 |
| M4 | `/mobile/status` | `app/mobile/status/page.tsx` | 없음 | 년·월 select, 카운트 카드 4종, 작업 카드와 StatusBadge, 반려 안내 문구, "완료검수" 버튼(진행 상태만) |
| M5 | `/mobile/material-photo` | `app/mobile/material-photo/page.tsx` | 없음 | ① 부자재 목록(조회 필터, 등록상태 필터) ② 부자재 선택 상세(신규등록/수정등록, 등록 삭제 버튼, 삭제 오류) ③ OCR 등록 화면(`setMode("OCR")`, 마스터 OCR 미사용이면 버튼 비활성): 촬영→ROI→인식→검토→저장, "OCR 서버 검증 불가" 경고 배지, "코드와 일치/다름" 배지 ④ 비전 등록 화면(`setMode("VISION")`): 다중 사진 썸네일(활성 violet 링, 영역확정 배지), 유사도 박스 |
| M6 | `/mobile/settings` | `app/mobile/settings/page.tsx` | 없음 | 부서·화주 select, 알림 항목 |
| M7 | `/mobile/scan` | `app/mobile/scan/page.tsx` → `BarcodeScannerPanel` | 직접 URL로만 진입(탭 링크 없음, 레거시 플로우) | 스캔 안내 문구, 실패 메시지 |
| M8 | `/mobile/inspection/[workId]` | `app/mobile/inspection/[workId]/page.tsx` | M7에서 문서 매칭 시(레거시) | STEP 카드, ImageUploadCard(정적), mock 버튼(toast만) |
| M9 | `/mobile/sign/[workId]` | `app/mobile/sign/[workId]/page.tsx` | M8에서 전부 합격 시(레거시) | SignaturePad |
| M10 | `/mobile/result/[workId]` | `app/mobile/result/[workId]/page.tsx` | M9 저장 후(레거시) | 결과 집계, confetti 효과, "다음 문서 검수" |

### 4-4. 인쇄 화면(`app/print`)

| ID | 경로 | 파일 | 열기 조건 | 확인 포인트 |
|---|---|---|---|---|
| R1 | `/print/work-order/[workId]?…` | `app/print/work-order/[workId]/page.tsx`, `app/print/layout.tsx` | P3에서 출력(쿼리 templateId·issueId·autoPrint, 스코프 포함) | 상단 툴바(인쇄/닫기, `print:hidden`), 오류 박스+다시 시도, 로딩 문구, DocumentRenderer A4 양식. 인쇄 미리보기에서 페이지 넘침과 폰트 확인 |

---

## 5. 인라인 스타일 치환 규칙표

원칙: **문자열 일괄 sed 금지 항목**(★)은 반드시 맥락을 보고 바꿈. 나머지는 파일 단위 찾아바꾸기를 허용함.

| 패턴 | 횟수 | 새 클래스 | 비고 |
|---|---:|---|---|
| `font-black` | 427 | ★ 제목(h1·h2·h3, text-lg 이상, KPI 숫자) → `font-semibold` / 그 외 → `font-medium` | 1-3 표 기준 |
| `font-extrabold` | 14 | `font-medium` | 버튼·탭 |
| `font-bold` | 287 | `font-medium` | 표 셀, 라벨 |
| `font-semibold` | 48 | 보조 설명 p → `font-normal`(삭제) / 라벨 → 유지 | |
| `rounded-[1.2rem]` | 43 | `rounded-lg`(표·내부 박스 외곽) | |
| `rounded-[1.5rem]` / `rounded-[1.4rem]` | 19 / 8 | `rounded-lg` | 카드·모달 |
| `rounded-[2rem]`, `[1.8rem]`, `[1.6rem]`, `[1.1rem]` | 각 1 | `rounded-lg` | |
| `rounded-2xl` | 152 | `rounded-md` | 알림 박스, 입력창, 내부 박스 |
| `rounded-xl` | 46 | `rounded-md` | ROI 박스(`TouchRegionSelector:165`)는 `rounded-md` 가능 |
| `rounded-full` | 195 | ★ 버튼·입력·select·탭·배지·필 → `rounded-md` / `size-*` 원형·아바타·진행바·토글·ROI 핸들·썸네일 위 작은 표식 → 유지 | 기계 치환 금지 |
| `bg-[radial-gradient(…)]` | 1 | `bg-background` | AppShell |
| `bg-[linear-gradient(…)]` | 1 | `bg-background` | MobileShell |
| `bg-gradient-to-br …` | 4 | `bg-card` 또는 `bg-muted` | Sidebar, ImageUploadCard, InspectionRegionEditor(미사용), 1곳 placeholder |
| `bg-[#f8fbff]` | 23 | `bg-card` | 모달 패널 22, TopFilterBar 1 |
| `shadow-[0_24px_80px_rgba(15,23,42,0.22)]` | 22 | `shadow-lg` | 모달 |
| `shadow-[0_18px_50px_…]` | 1 | `shadow-xs` | CuteCard |
| `shadow-[0_16px_40px_…]` | 1 | `shadow-md` | 상태 드롭다운 |
| `shadow-[0_-12px_40px_…]` | 1 | 삭제(`border-t`로 대체) | 모바일 하단 nav |
| `shadow-[0_0_0_999px_rgba(15,23,42,0.18)]` | 1 | **유지** | ROI 바깥 어둡게 처리(기능) |
| `shadow-sky-*`, `shadow-lg shadow-sky-100` | 4 | 삭제 | |
| `shadow-sm` | 69 | 버튼·입력 → `shadow-xs` / 필·배지 → 삭제 | |
| `backdrop-blur-sm` | 22 | 삭제 | 모달 오버레이 |
| `backdrop-blur` | 5 | 삭제 | 셸·카드 |
| `bg-slate-950/35` | 22 | `bg-slate-950/50` | |
| `bg-white/NN`(70·75·60·80·85·82·95) | 85 | `bg-card`(컨테이너) / 중첩 패널 → `bg-muted/40` | |
| `bg-white/90`, `/20`, `/25`, `/45`, `/18` | 소수 | ★ 이미지·ROI 위 오버레이는 유지 | Lightbox, 썸네일 배지, ROI |
| `border-white/NN` | 47 | `border-border` | |
| `ring-white/NN` | 20 | `ring-border` | |
| `bg-sky-500` | 22 | `bg-primary` | `text-white`는 `text-primary-foreground` |
| `hover:bg-sky-600`, `bg-sky-600` | 3 / 3 | `hover:bg-primary/90` / `bg-primary` | |
| `text-sky-700` | 78 | 링크·강조 → `text-primary` / 배지 → `text-blue-700` | |
| `text-sky-600` | 35 | eyebrow → `text-muted-foreground` / 아이콘 → `text-primary` | |
| `text-sky-500` | 15 | `text-primary` | |
| `bg-sky-50`(+`/50~/90`) | 123 | thead → `bg-muted/60` / 선택 행·활성 옵션·hover → `bg-accent` / 정보 필 → `bg-blue-50` | |
| `bg-sky-100` | 20 | 배지 → `bg-blue-50` / 활성 → `bg-accent` | |
| `ring-sky-*` | 81 | 중립 테두리 → `ring-border` / 배지 → `ring-blue-600/20` | |
| `border-sky-100`, `border-sky-200` | 다수 | 입력 → `border-input` / 점선 업로드 영역 → `border-input border-dashed` | |
| `focus:ring-2 focus:ring-sky-200` | 43 | `focus-visible:ring-2 focus-visible:ring-ring/40` | violet·rose 변형 13건도 동일. 오류 입력(rose)은 `focus-visible:ring-red-500/30` |
| `hover:bg-sky-50/70`(표 행) | 5 | `hover:bg-muted/50` | |
| 기타 `sky-N` | 잔여 | 같은 단계의 `blue-N` | sky 총 458 |
| `violet-*`(장식) | 약 60 | eyebrow → `text-muted-foreground`, thead → 중립 thead, 미리보기 버튼 → soft, LOT 강조 `text-violet-700` → `text-foreground font-medium`, select 테두리 → `border-input` | 1-6 표 |
| `violet-*`(의미) | 약 38 | ★ 유지: OCR/VISION 구분(ReferenceRegisterModal 224·269·368, ReferenceDetailModal 47·133, material-master 486, TouchRegionSelector 88-91, material-photo 364·1167-1288), 제품/부자재 구분(work-register 783·1029), 단계 "대상"(work-inspection 45), 토글 선택 상태(users 167, shipper 353 → primary로 바꿔도 됨) | violet 총 98 |
| `indigo-*` | 20 | 사진 승인대기 의미 → 유지(배지 형식만 2-5) / 섹션 헤더 바탕 `bg-indigo-50/60` → `bg-card` + 아이콘만 indigo | |
| `rose-*` | 214 | 같은 단계의 `red-*` | 의미(오류·반려) 동일 |
| `emerald-*`, `amber-*`, `orange-*`, `teal-*` | 118 / 157 / 11 / 1 | 유지(배지 형식만 통일). teal → emerald | |
| 컬러 thead(`bg-violet-50/80`, `bg-indigo-50/40`, `bg-emerald-50/80`, `bg-amber-50/40` + 같은 계열 글자) | 6 | `bg-muted/60 text-xs font-medium text-muted-foreground` | thead 전체 22곳 통일 |
| `uppercase`(DataTable thead) | 1 | 삭제 | |
| `hover:scale-[1.02]` | 2 | 삭제(`transition-colors`로 대체) | |
| `text-slate-800`, `text-slate-700` | 135 / 다수 | `text-foreground` | |
| `text-slate-500`, `text-slate-600` | 다수 | `text-muted-foreground` | slate-600은 표 본문이면 `text-foreground` |
| `text-slate-400` | 119 | `text-muted-foreground` | slate-400은 흰 바탕 대비가 부족함(AA 미달) |
| `text-[10px]` | 일부(10·11px 합 59) | `text-[11px]` | 썸네일 위 `text-[9px]`는 유지 |
| 입력(`h-11`/`h-12` + `rounded-full`/`rounded-2xl` + `border-sky-100`) | 47 | 웹: `h-9 rounded-md border border-input bg-card px-3 text-sm shadow-xs` / 모바일: 높이 `h-11`·`h-12` 유지, `rounded-md border-input` | 모바일은 터치 영역 유지 |
| 탭 그룹(`inline-flex rounded-full bg-slate-100 p-1`, document-master 탭) | 3 | 컨테이너 `inline-flex h-9 items-center rounded-lg bg-muted p-1` / 버튼 `h-7 rounded-md px-3 text-sm font-medium` / 활성 `bg-card text-foreground shadow-xs` / 비활성 `text-muted-foreground hover:text-foreground` | 활성 판정식은 유지 |
| 데이터 소스 필(`bg-sky-50 text-sky-700 ring-sky-100` / 오류 `bg-rose-50 …`) | 웹 6곳 | 정상 `bg-muted text-muted-foreground ring-border`, 오류 `bg-red-50 text-red-700 ring-red-600/20` | 오류 의미 유지 |
| 건수 필(`rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700`) | 다수 | `rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums` | |

---

## 6. 제거·교체 문구와 시스템명 변경 위치

### 6-1. 시스템명·메타

| 파일:라인 | 현재 | 변경 |
|---|---|---|
| `app/layout.tsx:5` | `title: "솜솜 부자재 OCR/비전 검수"` | `title: { default: "유통가공관리시스템", template: "%s · 유통가공관리시스템" }`(페이지들이 client 컴포넌트라 현재는 default만 적용됨) |
| `app/layout.tsx:6` | `"구름처럼 폭신한 부자재 OCR/비전 검수 업무 시스템"` | `"유통가공 작업등록·부자재 검수(OCR/비전/사진)·작업현황 관리 시스템"` |
| `app/layout.tsx:13` | `themeColor: "#e8f7ff"` | `"#ffffff"`(모바일 헤더 흰색과 일치) |
| `public/manifest.json:2-3` | `"솜솜 부자재 검수"` / `"솜솜검수"` | `"유통가공관리시스템"` / `"유통가공"` |
| `public/manifest.json:6-7` | `background_color "#f8fbff"`, `theme_color "#e8f7ff"` | `"#f5f7fa"`, `"#ffffff"` |
| `app/icon.svg:1` | `aria-label="솜솜 검수실 G 로고"`, 하늘색 그라데이션(#38bdf8→#0284c7) | aria-label `"유통가공관리시스템 로고"`, 주황 그라데이션(최종 반영, 실제 `app/icon.svg` 기준) |
| `public/icons/icon.svg`, `icon-square.svg` | 같은 로고 사본 | 같은 변경 |
| `app/apple-icon.png`, `public/icons/icon-16/32/192/512.png` | 하늘색 G 로고 | **결정 완료**: PNG도 주황 그라데이션으로 재생성함 |
| `components/layout/Sidebar.tsx:41` | `aria-label="솜솜 검수실 홈"` | `"유통가공관리시스템 홈"` |
| `components/layout/Sidebar.tsx:44-45` | `Cloud` + `Sparkles` | `Boxes`(import 정리) |
| `components/layout/Sidebar.tsx:48-49` | `솜솜 검수실` / `부자재 OCR/Vision` | `유통가공관리시스템` / `부자재 검수 · 작업관리` |
| `components/mobile/MobileShell.tsx:26-28` | `Cloud` + `모바일 업무` | `Boxes` + `유통가공관리시스템` |

### 6-2. 장식 문구 제거·교체

| 파일:라인 | 현재 | 변경 |
|---|---|---|
| `components/layout/TopFilterBar.tsx:130` | 오늘도 폭신하게 정확히 검수해요 | `유통가공관리시스템`(lg 미만에서만 표시, 2-9) |
| `components/common/PageHeader.tsx:14-16` | `Sparkles` + fluffy workflow | 삭제 |
| `components/common/EmptyCloudState.tsx:9` | 구름 위에서 부서와 화주를 기다리고 있어요. | 부서와 화주를 선택하세요. |
| `components/common/EmptyCloudState.tsx:10` | 오른쪽 상단에서 부서와 화주를 선택하면 업무 데이터가 살포시 나타납니다. | 상단 필터에서 부서와 화주를 선택하면 해당 범위의 업무 데이터가 표시됩니다. |
| `components/common/EmptyCloudState.tsx:15-16` | `Cloud` + `Sparkles` | `ListFilter` |
| `components/common/ImageUploadCard.tsx:24` | 기준 이미지 또는 촬영 이미지를 올려요 | 기준 이미지 또는 촬영 이미지를 업로드합니다 |
| `components/mobile/BarcodeScannerPanel.tsx:30` | 바코드를 구름 안에 맞춰주세요 | 바코드를 스캔 영역 안에 맞춰주세요 |
| `app/mobile/result/[workId]/page.tsx:32` | `Cloud` 큰 아이콘 | `CheckCircle2`(`size-16 text-emerald-600`) |
| `app/mobile/result/[workId]/page.tsx:22` | canvas-confetti 축하 효과 | **결정 완료: 제거**(CheckCircle2로 대체). `docs/menus/mobile.md` 갱신 완료 |
| `app/(workspace)/document-master/page.tsx:22` | 양식이 소속될 부서를 먼저 골라주세요. / 문서양식은 반드시 부서에 소속되어야 해요. | 부서를 먼저 선택하세요. / 문서양식은 부서 단위로 관리됩니다. |
| `app/(workspace)/shipper-master/page.tsx:92` | 화주가 소속될 부서를 먼저 골라주세요. / 화주는 반드시 부서에 소속되어야 해요. | 부서를 먼저 선택하세요. / 화주는 부서 단위로 관리됩니다. |

### 6-3. 안내 문구 톤 통일(권장, 각 묶음이 자기 파일에서 처리)

- 대상: JSX 안의 `~이에요/~어요/~해요` 종결 72곳(grep 기준). 예: `불러오는 중이에요.` → `불러오는 중입니다.`, `찾지 못했어요.` → `찾을 수 없습니다.`, `저장할 수 있어요.` → `저장할 수 있습니다.`, `반려된 항목이 있어요` → `반려된 항목이 있습니다`
- 대표 위치: 각 화면 로딩 문구(work-register:291, work-status:332·604, work-inspection:168, material-master:234·558, shipper-master:109, department-master:62, users:58, document-master TemplateTab:202, ShipperMappingTab:196, WorkOrderModal:220·270, PhotoApprovalModal:245, ReferenceDetailModal:157·177), PasteImageInput:63·69·80·129·134·156, ReferenceRegisterModal:244·315·347·365·385, material-master:46·47, mobile page:41·48·103, pre:94·98·105·173, complete:88·92·99·145·216, inspection:24·28·63·72·84, sign:16·17, result:27·28·39, status:152, ProductChecklist:105, MaterialInspectionList:58, CompletionProductPhotoCard:154, PhotoReviewCard:136·138·157·164·171·234·239
- **바꾸지 않음**: `lib/constants/status.ts`의 라벨(`getStepClassName`이 `includes("승인대기")` 같은 문자열 비교에 씀), aria-label, data-testid, mock 데이터(`lib/mock/data.ts`의 "구름상점", "박구름" 등 데이터 값, `work-master/page.tsx:42` 샘플 "구름 완제품")
- toast 문구도 같은 규칙을 적용하되 우선순위는 낮음

---

## 7. 작업 분할안(파일 겹침 없음)

| 묶음 | 담당 파일 | 비고 |
|---|---|---|
| **A. 토큰·공통·셸** | `package.json`, `package-lock.json`(pretendard 추가), `app/globals.css`, `app/layout.tsx`, `app/icon.svg`, `public/manifest.json`, `public/icons/*.svg`, `components/common/*`(7개), `components/layout/*`(3개), `components/mobile/MobileShell.tsx`, `components/mobile/MobileScopeBadge.tsx`, `components/inspection/OcrTextCompare.tsx`(웹 P5·모바일 OCR 카드 공용), 미사용 컴포넌트 `components/admin/AdminReviewPanel.tsx`, `components/work/WorkProgressTimeline.tsx`, `components/inspection/OcrInspectionPanel.tsx`, `VisionInspectionPanel.tsx`, `InspectionRegionEditor.tsx`(호출처 0건. 클래스만 정리, 우선순위 낮음) | 가장 먼저 커밋하면 B/C 미리보기가 정확함. 다만 Tailwind는 정의되지 않은 `bg-primary`를 오류 없이 무시하므로 동시 착수도 가능함 |
| **B1. 웹 작업흐름** | `app/(workspace)/work-register/*`(page, WorkOrderModal), `app/(workspace)/work-status/page.tsx`, `app/(workspace)/work-inspection/*`(page, PhotoApprovalModal), `app/(workspace)/dashboard/page.tsx`(변경 없음 확인만) | 팝업 P1~P10 |
| **B2. 웹 마스터** | `app/(workspace)/work-master/page.tsx`, `app/(workspace)/material-master/*`(page, ReferenceRegisterModal, ReferenceDetailModal, PasteImageInput, reference-status.ts), `app/(workspace)/department-master/page.tsx`, `app/(workspace)/shipper-master/page.tsx`, `app/(workspace)/document-master/*`(14개), `app/(workspace)/users/page.tsx` | 팝업 P11~P27. `TouchRegionSelector`는 C 소유라 수정 금지(B2는 결과 화면만 확인) |
| **C. 모바일·인쇄** | `app/mobile/**`(11개), `components/mobile/*` 중 MobileShell·MobileScopeBadge를 뺀 전부(BarcodeScannerPanel, CompletionPhotoCard, CompletionProductPhotoCard, MaterialInspectionList, MobileScopeInitializer, OcrInspectionCard, PhotoReviewCard, ProductChecklist, SignaturePad, TouchRegionSelector), `app/print/**`(layout, work-order page 툴바), `components/documents/print.css`(4행 font-family만) | `components/documents/*.tsx`(양식 렌더러)는 수정하지 않음 |
| 문서 | `docs/menus/*.md` | doc-sync-team. 컴포넌트 이름은 바뀌지 않으므로 문구 변경(EmptyCloudState 기본 문구, confetti 결정 결과, Sidebar 구조)만 반영 |

- 3명 운용 시 B1과 B2를 하나로 합침
- 공통 검수 체크: `npm run build`, `npm run lint`, 4장 인벤토리 전수 열람(웹 1440px·1024px·768px, 모바일 390px), 인쇄 미리보기 A4

---

## 8. 리스크와 대응

| # | 리스크 | 위치 | 대응 |
|---|---|---|---|
| 1 | 상태 색이 의미를 갖는 조건부 className을 기계 치환해 색 구분이 사라짐 | StatusBadge toneMap, work-status `displayStatusMeta`·KPI·`materialStatusMeta`, work-inspection 조정맵·`getStepClassName`, PhotoApprovalModal 상태맵, material-master 기준버튼 4상태, material-photo 364·1248·1251·1273, OcrInspectionCard 판정색(합격 초록/미달 빨강/판정불가 주황), OcrTextCompare 차이 강조, TouchRegionSelector tone, ROI 테두리(OCR blue/VISION violet), work-register 제품/부자재 구분, users·shipper 토글, CloudButton warning(상세필터 적용), 탭·필터 활성, Sidebar·모바일 탭 활성, 데이터 소스 오류 필 | 2-5·2-8·5장 표대로 hue를 유지하고 단계와 형태만 바꿈. 검수팀은 각 상태를 실제 데이터로 1회 이상 확인 |
| 2 | `getStepClassName`의 includes 순서 변경으로 "완료승인대기"가 "승인대기"가 아닌 "완료" 색으로 바뀜 | `work-inspection/page.tsx:41-51` | 함수 본문 순서와 조건 문자열은 수정 금지, 반환 클래스만 교체 |
| 3 | `rounded-full` 일괄 치환으로 원형 요소가 깨짐 | ROI 핸들(`TouchRegionSelector:182`), 아바타, 진행바, 토글, 썸네일 표식 | 5장 ★ 규칙. sed 금지 |
| 4 | twMerge 충돌 | `cn()` 사용 부품 전반 | 커스텀 font-size 토큰 금지. 색 토큰 이름(`bg-primary` 등)은 twMerge가 색으로 인식하므로 문제 없음 |
| 5 | 비활성 버튼 툴팁 소실 | `work-inspection/page.tsx:374`, TemplateTab 249·253 | `disabled:pointer-events-none` 사용 금지 |
| 6 | QA 자동화 셀렉터 깨짐 | aria-label 다수, data-testid 13곳 | aria-label·data-testid·role 문자열은 그대로 둠 |
| 7 | 인쇄 양식 회귀 | `components/documents/print.css`(`.doc-root` 한정 문서 양식), `layouts.tsx` | 양식 레이아웃·색·크기는 **수정하지 않음**. 폰트 통일 지시에 따라 4행 font-family 앞에 Pretendard만 추가함. Pretendard는 Apple SD Gothic Neo보다 글자 폭이 약간 넓어 표 줄바꿈이나 A4 넘침이 생길 수 있음 → 등록된 양식 전체를 인쇄 미리보기로 확인하고, 넘치면 그 1줄만 되돌림(대표님 보고) |
| 8 | 폰트 로딩 지연 | 모바일 첫 진입, 인쇄 | dynamic-subset 방식으로 필요한 조각만 받음. 인쇄는 `document.fonts.ready` 대기 로직이 이미 있음. 빌드 후 `_next/static/media`에 woff2가 생성되는지 확인 |
| 9 | Sidebar sticky 전환 | `Sidebar.tsx` | `h-screen overflow-y-auto`로 낮은 화면을 대응. lg 미만 폭(w-16/w-20)은 유지 |
| 10 | 기본 테두리색 변경(`* { border-color }`) | 색 미지정 `border` | 의도된 개선. ROI·선택 강조 테두리는 색을 명시하고 있어 영향 없음 |
| 11 | 모달 푸터 grid→flex 오적용 | `grid grid-cols-2 gap-2` 17곳(폼 2열 포함) | 자식이 버튼 2개인 모달 푸터만 바꿈 |
| 12 | 네이티브 confirm/prompt | 5곳(3-1, 4장) | 스타일 대상이 아님. 커스텀 다이얼로그로 바꾸면 기능 변경이 되므로 금지 |
| 13 | CuteCard 호출부 override 잔존 | `bg-violet-50/70`(VisionInspectionPanel), `p-0` 등 | `p-0` 같은 레이아웃 override는 유지. 색 override만 B/C가 정리 |
| 14 | 기존 미동작 UI | users "사용자 추가"(핸들러 없음), mobile `/inspection` 계열 mock 버튼 | 현행 유지(기능 동일). 검수 시 결함으로 오인하지 않도록 4장에 명시함 |
| 15 | 문구 변경으로 인한 로직 영향 | `lib/constants/status.ts` 라벨 | 라벨 상수는 수정 금지(6-3) |

### 결정 결과(대표님, 2026-10-31)
1. 사이드바 색: 남색(기본안)/흰색 → **최종 따뜻한 짙은 회색 `#262523`, 선택 메뉴만 주황**(주색 변경에 따름)
2. PNG 아이콘 재생성: **완료**(주황 그라데이션)
3. 모바일 결과 화면 confetti: **제거**(CheckCircle2 아이콘으로 대체)
4. 안내 문구 존댓말 통일(6-3): **업무 톤(~합니다)으로 통일 완료**
