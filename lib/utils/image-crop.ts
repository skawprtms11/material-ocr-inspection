// 카메라로 촬영한 원본 사진을 ROI(퍼센트 좌표) 기준으로 캔버스에서 잘라내는 공용 유틸.
export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = url;
  });
}

export type RectLimits = { min: number; max: number };

// 웹 등록·홈 OCR 카드의 기존 기준(최소 1%, 최대 100%).
export const ROI_LIMITS_STANDARD: RectLimits = { min: 1, max: 100 };
// 모바일 부자재등록 ROI 편집기의 기존 기준(최소 0.8%, 최대 96%).
export const ROI_LIMITS_EDITOR: RectLimits = { min: 0.8, max: 96 };

export function constrainRect(rect: Rect, limits: RectLimits = ROI_LIMITS_STANDARD): Rect {
  const width = clamp(rect.width, limits.min, limits.max);
  const height = clamp(rect.height, limits.min, limits.max);
  const x = clamp(rect.x, 0, 100 - width);
  const y = clamp(rect.y, 0, 100 - height);
  return { x, y, width, height };
}

export async function cropImageFile(file: File, rect: Rect, filePrefix = "roi", limits: RectLimits = ROI_LIMITS_STANDARD) {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const roi = constrainRect(rect, limits);
    const sourceX = clamp(Math.round((roi.x / 100) * image.naturalWidth), 0, Math.max(0, image.naturalWidth - 1));
    const sourceY = clamp(Math.round((roi.y / 100) * image.naturalHeight), 0, Math.max(0, image.naturalHeight - 1));
    const sourceWidth = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round((roi.width / 100) * image.naturalWidth)));
    const sourceHeight = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round((roi.height / 100) * image.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("선택 영역 이미지를 만들지 못했습니다.");

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (nextBlob) resolve(nextBlob);
          else reject(new Error("선택 영역 이미지를 변환하지 못했습니다."));
        },
        "image/jpeg",
        0.92
      );
    });

    return {
      file: new File([blob], `${filePrefix}-${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }),
      width: sourceWidth,
      height: sourceHeight,
      sourceRect: { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight },
      originalSize: { width: image.naturalWidth, height: image.naturalHeight }
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
