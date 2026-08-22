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

function safeRoi(rect: Rect): Rect {
  const width = clamp(rect.width, 1, 100);
  const height = clamp(rect.height, 1, 100);
  const x = clamp(rect.x, 0, 100 - width);
  const y = clamp(rect.y, 0, 100 - height);
  return { x, y, width, height };
}

export async function cropImageFile(file: File, rect: Rect, filePrefix = "roi") {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const roi = safeRoi(rect);
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
      height: sourceHeight
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
