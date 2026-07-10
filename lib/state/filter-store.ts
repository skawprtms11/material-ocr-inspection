"use client";

import { create } from "zustand";

type FilterState = {
  departmentId: string;
  shipperId: string;
  setScope: (scope: { departmentId: string; shipperId: string }) => void;
  setDepartmentId: (departmentId: string) => void;
  setShipperId: (shipperId: string) => void;
};

export const defaultFilterScope = {
  departmentId: "11111111-1111-1111-1111-111111111111",
  shipperId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
};

export const useFilterStore = create<FilterState>((set) => ({
  ...defaultFilterScope,
  setScope: (scope) => set(scope),
  setDepartmentId: (departmentId) => set({ departmentId, shipperId: "" }),
  setShipperId: (shipperId) => set({ shipperId })
}));
