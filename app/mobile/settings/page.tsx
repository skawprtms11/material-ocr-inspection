"use client";

import { useEffect, useState } from "react";
import { Bell, Camera, Settings, UserRound } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import type { AppUser } from "@/lib/types/domain";

type UsersResponse = {
  source: "supabase" | "mock";
  warning?: string;
  users: AppUser[];
};

function pickCurrentUser(users: AppUser[]) {
  return users.find((user) => user.email === "admin@example.com") ?? users.find((user) => user.role === "admin") ?? users[0] ?? null;
}

export default function MobileSettingsPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [source, setSource] = useState<UsersResponse["source"]>("mock");
  const [warning, setWarning] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setIsLoading(true);
      setWarning("");

      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const payload = (await response.json()) as UsersResponse;
        if (!response.ok) throw new Error(payload.warning ?? "사용자 정보를 불러오지 못했습니다.");
        if (!isMounted) return;

        setUser(pickCurrentUser(payload.users));
        setSource(payload.source);
        setWarning(payload.warning ?? "");
      } catch (error) {
        if (!isMounted) return;
        setUser(null);
        setSource("mock");
        setWarning(error instanceof Error ? error.message : "사용자 정보를 불러오지 못했습니다.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const displayUser = user ?? {
    name: isLoading ? "불러오는 중" : "사용자",
    email: warning || "사용자 정보 없음"
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">설정</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">모바일 설정</h1>
        <p className="mt-2 text-xs font-black text-slate-400">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
      </CuteCard>

      {warning && (
        <CuteCard className="p-3 text-xs font-bold leading-5 text-amber-700">
          {warning}
        </CuteCard>
      )}

      <CuteCard className="p-4">
        <div className="flex items-center gap-3">
          <UserRound className="size-9 rounded-full bg-sky-100 p-2 text-sky-600" />
          <div>
            <p className="font-black text-slate-800">{displayUser.name}</p>
            <p className="text-xs font-bold text-slate-400">{displayUser.email}</p>
          </div>
        </div>
      </CuteCard>

      <CuteCard className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
            <span className="flex items-center gap-2">
              <Camera className="size-4 text-sky-500" />
              카메라 권한
            </span>
            <span className="text-xs font-black text-slate-400">브라우저 설정 사용</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
            <span className="flex items-center gap-2">
              <Bell className="size-4 text-violet-500" />
              알림
            </span>
            <span className="text-xs font-black text-slate-400">준비중</span>
          </div>
        </div>
      </CuteCard>
    </div>
  );
}
