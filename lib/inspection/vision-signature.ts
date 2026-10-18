export type Rect = { x: number; y: number; width: number; height: number };

export type VisionPairScore = { a: number; b: number; similarity: number };

const visionSampleSize = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function constrainRect(rect: Rect): Rect {
  const width = clamp(rect.width, 0.8, 96);
  const height = clamp(rect.height, 0.8, 96);
  const x = clamp(rect.x, 0, 100 - width);
  const y = clamp(rect.y, 0, 100 - height);

  return { x, y, width, height };
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = url;
  });
}

export async function cropImageFile(file: File, rect: Rect, filePrefix = "ocr-roi") {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const safeRect = constrainRect(rect);
    const sourceX = clamp(Math.round((safeRect.x / 100) * image.naturalWidth), 0, Math.max(0, image.naturalWidth - 1));
    const sourceY = clamp(Math.round((safeRect.y / 100) * image.naturalHeight), 0, Math.max(0, image.naturalHeight - 1));
    const sourceWidth = Math.max(1, Math.min(image.naturalWidth - sourceX, Math.round((safeRect.width / 100) * image.naturalWidth)));
    const sourceHeight = Math.max(1, Math.min(image.naturalHeight - sourceY, Math.round((safeRect.height / 100) * image.naturalHeight)));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("선택 영역 이미지를 만들지 못했습니다.");

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("선택 영역 이미지를 변환하지 못했습니다."));
      }, "image/jpeg", 0.92);
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

async function getVisionSignature(file: File, rect: Rect) {
  const cropped = await cropImageFile(file, rect, "vision-roi");
  const url = URL.createObjectURL(cropped.file);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = visionSampleSize;
    canvas.height = visionSampleSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("비전 일치율 샘플을 만들지 못했습니다.");

    context.drawImage(image, 0, 0, visionSampleSize, visionSampleSize);
    const pixels = context.getImageData(0, 0, visionSampleSize, visionSampleSize).data;
    const signature = new Uint8Array(visionSampleSize * visionSampleSize);

    for (let index = 0; index < signature.length; index += 1) {
      const pixelIndex = index * 4;
      signature[index] = Math.round(
        pixels[pixelIndex] * 0.299 +
          pixels[pixelIndex + 1] * 0.587 +
          pixels[pixelIndex + 2] * 0.114
      );
    }

    return signature;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function compareVisionSignatures(a: Uint8Array, b: Uint8Array) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let diff = 0;
  for (let index = 0; index < length; index += 1) {
    diff += Math.abs(a[index] - b[index]);
  }

  return clamp(1 - diff / length / 255, 0, 1);
}

// 사진별 영역을 24x24 그레이스케일 서명으로 만들어 모든 쌍의 일치율(평균/최저)을 계산한다. 참고용이며 서버 판정이 아니다.
export async function compareVisionRegions(items: { file: File; rect: Rect }[]) {
  const signatures = await Promise.all(items.map((item) => getVisionSignature(item.file, item.rect)));
  const pairScores: VisionPairScore[] = [];

  for (let a = 0; a < signatures.length; a += 1) {
    for (let b = a + 1; b < signatures.length; b += 1) {
      pairScores.push({ a, b, similarity: compareVisionSignatures(signatures[a], signatures[b]) });
    }
  }

  const average = pairScores.reduce((sum, pair) => sum + pair.similarity, 0) / Math.max(1, pairScores.length);
  const minimum = pairScores.reduce((min, pair) => Math.min(min, pair.similarity), 1);

  return { average, minimum, pairScores };
}
