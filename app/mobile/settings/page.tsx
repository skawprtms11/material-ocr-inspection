"use client";

import { Bell, Camera, Settings, UserRound } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { appRepository } from "@/lib/repositories/app-repository";

export default function MobileSettingsPage() {
  const user = appRepository.getCurrentUser();

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">설정</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">모바일 설정</h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">세부 설정 항목은 별도 정의 예정입니다.</p>
      </CuteCard>

      <CuteCard className="p-4">
        <div className="flex items-center gap-3">
          <UserRound className="size-9 rounded-full bg-sky-100 p-2 text-sky-600" />
          <div>
            <p className="font-black text-slate-800">{user.name}</p>
            <p className="text-xs font-bold text-slate-400">{user.email}</p>
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
