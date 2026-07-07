import { createSign } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RoiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type VisionAnnotation = {
  description?: string;
  boundingPoly?: {
    vertices?: { x?: number; y?: number }[];
  };
};

type VisionResponse = {
  responses?: {
    textAnnotations?: VisionAnnotation[];
    error?: { message?: string };
  }[];
};

function base64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

function getCredentials() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey)
  };
}

async function getAccessToken() {
  const credentials = getCredentials();
  if (!credentials) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    })
  );
  const unsignedJwt = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer
    .sign(credentials.privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedJwt}.${signature}`
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Google OAuth token request failed: ${message}`);
  }

  const token = (await response.json()) as { access_token?: string };
  return token.access_token ?? null;
}

function getRoiText(annotations: VisionAnnotation[], roi: RoiRect, imageWidth: number, imageHeight: number) {
  const words = annotations.slice(1);
  if (words.length === 0 || imageWidth <= 0 || imageHeight <= 0) return annotations[0]?.description?.trim() ?? "";

  const roiBox = {
    left: (roi.x / 100) * imageWidth,
    top: (roi.y / 100) * imageHeight,
    right: ((roi.x + roi.width) / 100) * imageWidth,
    bottom: ((roi.y + roi.height) / 100) * imageHeight
  };

  const roiWords = words.filter((word) => {
    const vertices = word.boundingPoly?.vertices ?? [];
    if (vertices.length === 0) return false;

    const xs = vertices.map((vertex) => vertex.x ?? 0);
    const ys = vertices.map((vertex) => vertex.y ?? 0);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return centerX >= roiBox.left && centerX <= roiBox.right && centerY >= roiBox.top && centerY <= roiBox.bottom;
  });

  return (roiWords.length > 0 ? roiWords : words)
    .map((word) => word.description)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isMatched(extractedText: string, expectedText: string) {
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  return normalize(extractedText).includes(normalize(expectedText));
}

function mockOcr(expectedText: string) {
  return NextResponse.json({
    provider: "mock",
    extractedText: expectedText,
    matched: true,
    summary: "Google Vision 환경변수가 없어 mock OCR 결과를 반환했습니다."
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const image = formData.get("image");
  const expectedText = String(formData.get("expectedText") ?? "").trim();
  const roi = JSON.parse(String(formData.get("roi") ?? "{}")) as RoiRect;
  const imageWidth = Number(formData.get("imageWidth") ?? 0);
  const imageHeight = Number(formData.get("imageHeight") ?? 0);

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "OCR 이미지 파일이 필요합니다." }, { status: 400 });
  }

  if (process.env.OCR_PROVIDER !== "google-vision" || !getCredentials()) {
    return mockOcr(expectedText);
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return mockOcr(expectedText);

    const content = Buffer.from(await image.arrayBuffer()).toString("base64");
    const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: process.env.GOOGLE_VISION_FEATURE_TYPE ?? "TEXT_DETECTION" }],
            imageContext: { languageHints: ["ko", "en"] }
          }
        ]
      })
    });

    const data = (await response.json()) as VisionResponse;
    const result = data.responses?.[0];

    if (!response.ok || result?.error) {
      return NextResponse.json(
        { error: result?.error?.message ?? "Google Vision OCR 호출에 실패했습니다." },
        { status: 502 }
      );
    }

    const annotations = result?.textAnnotations ?? [];
    const extractedText = getRoiText(annotations, roi, imageWidth, imageHeight);

    return NextResponse.json({
      provider: "google-vision",
      extractedText,
      matched: expectedText ? isMatched(extractedText, expectedText) : false,
      summary: extractedText
        ? "Google Vision OCR이 선택 영역의 텍스트를 읽었습니다."
        : "Google Vision OCR이 선택 영역에서 텍스트를 찾지 못했습니다."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 OCR 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
