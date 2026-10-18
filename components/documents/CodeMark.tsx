"use client";

import { useEffect, useState } from "react";

type CodeMarkProps = {
  value: string;
  caption?: boolean;
};

// 브라우저 API에 의존하므로 SSR 시에는 빈 박스만 렌더하고 마운트 후 SVG를 채운다.
// 인쇄 전 대기용으로 완료되면 data-code-ready="true"가 설정된다.
export function CodeMark({ value, caption = true }: CodeMarkProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvgMarkup(null);
    if (!value) return;

    import("@zxing/browser")
      .then(({ BrowserQRCodeSvgWriter }) => {
        const svg = new BrowserQRCodeSvgWriter().write(value, 200, 200);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.setAttribute("shape-rendering", "crispEdges");
        if (!cancelled) setSvgMarkup(svg.outerHTML);
      })
      .catch(() => {
        if (!cancelled) setSvgMarkup(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="doc-code" data-code-ready={svgMarkup ? "true" : "false"}>
      <div
        className="doc-code-box"
        aria-label={`QR ${value}`}
        dangerouslySetInnerHTML={svgMarkup ? { __html: svgMarkup } : undefined}
      />
      {caption ? <span className="doc-code-caption">{value}</span> : null}
    </div>
  );
}
