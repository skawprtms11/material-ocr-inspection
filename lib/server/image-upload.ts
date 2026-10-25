// 이미지 업로드 API 공용 검사. 형식(MIME)·크기 규칙을 한 곳에서 관리한다(스토리지 버킷 제한과 동일: jpeg/png/webp, 8MB).
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export type ImageCheckFailure = { status: 400 | 413; error: string };

// 위반 시 400(형식)/413(용량) 실패 정보를 돌려주고, 통과하면 null.
export function checkImageFile(file: File): ImageCheckFailure | null {
  if (!(file.type in IMAGE_EXTENSIONS)) {
    return { status: 400, error: "jpeg/png/webp 이미지만 제출할 수 있습니다." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { status: 413, error: "이미지는 8MB 이하여야 합니다." };
  }
  return null;
}

// 저장 확장자는 클라이언트 파일명이 아니라 검증된 MIME으로 정한다. checkImageFile 통과 후에만 호출한다.
export function imageExtension(mime: string) {
  return IMAGE_EXTENSIONS[mime] ?? "jpg";
}
