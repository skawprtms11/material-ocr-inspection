import type { InspectionStatus, MaterialInspectionRegion } from "@/lib/types/domain";

export type OcrInspectionInput = {
  expectedText: string;
  capturedImagePath: string;
  region: MaterialInspectionRegion;
};

export type VisionInspectionInput = {
  referenceImagePath: string;
  capturedImagePath: string;
  region: MaterialInspectionRegion;
};

export type OcrInspectionResult = {
  status: InspectionStatus;
  extractedText: string;
  summary: string;
};

export type VisionInspectionResult = {
  status: InspectionStatus;
  similarity: number;
  summary: string;
};

export interface InspectionProvider {
  runOcr(input: OcrInspectionInput): Promise<OcrInspectionResult>;
  runVision(input: VisionInspectionInput): Promise<VisionInspectionResult>;
}

export const mockInspectionProvider: InspectionProvider = {
  async runOcr(input) {
    const extractedText = input.expectedText.includes("DOC") ? `${input.expectedText}-1001` : input.expectedText;
    const passed = extractedText.toLowerCase().includes(input.expectedText.toLowerCase());

    return {
      status: passed ? "passed" : "failed",
      extractedText,
      summary: passed ? "mock OCR이 기준 텍스트를 찾았어요." : "mock OCR 결과가 기준과 달라요."
    };
  },
  async runVision(input) {
    const threshold = input.region.similarity_threshold ?? 0.86;
    const similarity = input.capturedImagePath.includes("retry") ? 0.92 : 0.84;

    return {
      status: similarity >= threshold ? "passed" : "failed",
      similarity,
      summary:
        similarity >= threshold
          ? "mock 비전 비교가 기준 유사도를 넘었어요."
          : "mock 비전 유사도가 기준보다 낮아요."
    };
  }
};
