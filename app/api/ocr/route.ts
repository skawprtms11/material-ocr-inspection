import { NextRequest, NextResponse } from "next/server";
import { runOcr, type RoiRect } from "@/lib/server/ocr";

export const runtime = "nodejs";

const fullImageRoi: RoiRect = { x: 0, y: 0, width: 100, height: 100 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isMatched(extractedText: string, expectedText: string) {
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  return normalize(extractedText).includes(normalize(expectedText));
}

function parseRoi(raw: FormDataEntryValue | null, field: string, fallback: RoiRect) {
  if (raw === null) return { roi: fallback };
  if (typeof raw !== "string") return { error: `${field}는 JSON 문자열이어야 합니다.` };

  try {
    const parsed = JSON.parse(raw) as Partial<RoiRect>;
    const width = clamp(Number(parsed.width), 1, 100);
    const height = clamp(Number(parsed.height), 1, 100);

    if (![parsed.x, parsed.y, parsed.width, parsed.height].every((value) => Number.isFinite(Number(value)))) {
      return { error: `${field} 좌표가 올바르지 않습니다.` };
    }

    return {
      roi: {
        x: clamp(Number(parsed.x), 0, 100 - width),
        y: clamp(Number(parsed.y), 0, 100 - height),
        width,
        height
      }
    };
  } catch {
    return { error: `${field} JSON을 해석하지 못했습니다.` };
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get("image");
  const expectedText = String(formData.get("expectedText") ?? "").trim();
  const isCropped = String(formData.get("isCropped") ?? "") === "true";
  const parsedRoi = parseRoi(formData.get("roi"), "roi", fullImageRoi);
  if (parsedRoi.error || !parsedRoi.roi) {
    return NextResponse.json({ error: parsedRoi.error ?? "OCR 영역 좌표가 필요합니다." }, { status: 400 });
  }

  const parsedOriginalRoi = parseRoi(formData.get("originalRoi"), "originalRoi", parsedRoi.roi);
  if (parsedOriginalRoi.error || !parsedOriginalRoi.roi) {
    return NextResponse.json({ error: parsedOriginalRoi.error ?? "원본 OCR 영역 좌표가 필요합니다." }, { status: 400 });
  }

  const roi = parsedRoi.roi;
  const originalRoi = parsedOriginalRoi.roi;
  const imageWidth = Number(formData.get("imageWidth") ?? 0);
  const imageHeight = Number(formData.get("imageHeight") ?? 0);

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "OCR 이미지 파일이 필요합니다." }, { status: 400 });
  }

  if (!isCropped && (!Number.isFinite(imageWidth) || imageWidth <= 0 || !Number.isFinite(imageHeight) || imageHeight <= 0)) {
    return NextResponse.json({ error: "OCR 원본 이미지 크기가 필요합니다." }, { status: 400 });
  }

  const result = await runOcr({ image, isCropped, roi, originalRoi, imageWidth, imageHeight });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    provider: result.provider,
    extractedText: result.extractedText,
    matched: expectedText ? isMatched(result.extractedText, expectedText) : false,
    canVerify: result.canVerify,
    roi: result.roi,
    summary: result.summary
  });
}
