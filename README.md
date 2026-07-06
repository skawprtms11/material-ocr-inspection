# 솜솜 부자재 OCR/비전 검수 시스템

React 19, Next.js, Tailwind CSS v4, Supabase를 기반으로 한 부자재 OCR/비전 검수 업무 시스템 초기 구현입니다. 웹에서는 작업/마스터/사용자/검수 관리를 하고, 모바일 웹에서는 문서번호 스캔부터 검수, 재검수/관리자 요청, 서명, 결과 확인까지 이어지는 PWA형 흐름을 제공합니다.

## 기술 스택

- React 19
- Next.js App Router
- Tailwind CSS v4
- clsx, tailwind-merge
- Motion
- Lucide React
- Supabase DB/Storage
- sonner, canvas-confetti
- zod, react-hook-form 확장 예정
- @zxing/browser, browser-image-compression, react-signature-canvas 확장 가능

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 웹 업무 화면으로 이동합니다. 모바일 검수 흐름은 `/mobile`에서 시작합니다.

## 환경변수

`.env.example`을 참고해 `.env.local`을 구성합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_USE_MOCK_DATA=true
```

Supabase 연결 정보가 없거나 `NEXT_PUBLIC_USE_MOCK_DATA=true`인 경우 mock repository 데이터로 화면을 확인합니다.

## Supabase 테이블 개념

- `departments`: 부서마스터
- `shippers`: 화주마스터
- `users`: 사용자관리
- `user_department_permissions`: 사용자별 부서 권한
- `user_shipper_permissions`: 사용자별 화주 권한
- `material_masters`: 부자재마스터
- `material_inspection_regions`: 부자재별 OCR/비전 ROI 영역
- `work_masters`: 작업마스터
- `work_master_materials`: 작업마스터별 부자재 매핑
- `works`: 작업등록 문서
- `work_inspections`: 작업별 검수 이력
- `inspection_images`: 검수 이미지 저장 정보
- `admin_review_requests`: 관리자 확인 요청
- `worker_signatures`: 작업자 서명
- `audit_logs`: 주요 작업 로그

모든 업무 조회는 `department_id`, `shipper_id` 기준으로 필터링되는 구조입니다. 운영 단계에서는 Supabase RLS 정책을 적용하고, 현재 `lib/repositories/app-repository.ts`를 실제 Supabase repository로 확장하면 됩니다.

## Storage bucket

- `material-images`: 부자재 기준 이미지
- `inspection-images`: 모바일 OCR/비전 촬영 이미지
- `signatures`: 작업자 서명 이미지

Storage path는 작업 ID와 문서번호를 함께 포함하도록 설계했습니다.

## OCR/Vision provider 교체

검수 로직은 `lib/providers/inspection-provider.ts`의 `InspectionProvider` 인터페이스로 분리되어 있습니다. 현재는 `mockInspectionProvider`가 기준 텍스트/유사도 mock 결과를 반환합니다. 추후 Google Vision, Azure OCR, AWS Textract, OpenAI Vision 등 실제 API provider를 같은 인터페이스로 추가하면 UI 변경 없이 교체할 수 있습니다.

## 메뉴 구조

- `/work-register`: 작업등록
- `/work-status`: 작업현황
- `/work-inspection`: 작업검수
- `/work-master`: 작업마스터
- `/material-master`: 부자재마스터
- `/department-master`: 부서마스터
- `/shipper-master`: 화주마스터
- `/users`: 사용자관리
- `/mobile`: 모바일 검수 시작
- `/mobile/scan`: 바코드/문서번호 스캔
- `/mobile/inspection/[workId]`: 모바일 OCR/비전 검수
- `/mobile/sign/[workId]`: 작업자 서명
- `/mobile/result/[workId]`: 검수 결과

## 모바일 검수 흐름

1. `/mobile`에서 검수 시작
2. `/mobile/scan`에서 바코드 또는 문서번호 직접 입력
3. `works.document_no`와 매칭
4. `/mobile/inspection/[workId]`에서 부자재별 OCR/비전 검수
5. 불합격 시 재검수 또는 관리자 확인 요청
6. 필수 부자재가 합격 또는 관리자 승인되면 서명
7. `/mobile/result/[workId]`에서 최종 결과 표시

## 추후 개발 TODO

- Supabase 실제 CRUD repository 구현
- RLS 정책 및 역할별 서버 권한 검증
- BarcodeDetector 또는 @zxing/browser 카메라 스캔 연결
- browser-image-compression 기반 업로드 전 이미지 압축
- Storage 업로드와 DB 트랜잭션 처리
- ROI 드래그/리사이즈와 다중 영역 편집
- 실제 OCR/Vision API provider 추가
- 관리자 승인/재검수 요청 상태 변경 API
- audit_logs 기록
- Netlify 배포 환경변수와 빌드 설정 점검
