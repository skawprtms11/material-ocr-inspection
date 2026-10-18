import { clamp, cropImageFile, loadImage, ROI_LIMITS_EDITOR, type Rect } from "@/lib/utils/image-crop";

export type VisionPairScore = { a: number; b: number; similarity: number };

const visionSampleSize = 24;

async function getVisionSignature(file: File, rect: Rect) {
  const cropped = await cropImageFile(file, rect, "vision-roi", ROI_LIMITS_EDITOR);
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
