import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    if (dev) {
      // 톡방 SQLite(.harness)·브라우저 테스트 로그(.playwright-mcp)·tsc 캐시가 수시로 변경되어
      // dev 서버가 무한 재컴파일 → API 응답이 간헐적으로 깨지는 문제를 막기 위해 감시에서 제외
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.harness/**", "**/.playwright-mcp/**", "**/tsconfig.tsbuildinfo", "**/.git/**"]
      };
    }
    return config;
  }
};

export default nextConfig;
