"use client";

import { create } from "zustand";

type FilterState = {
  departmentId: string;
  shipperId: string;
  setDepartmentId: (departmentId: string) => void;
  setShipperId: (shipperId: string) => void;
};

export const useFilterStore = create<FilterState>((set) => ({
  departmentId: "11111111-1111-1111-1111-111111111111",
  shipperId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  setDepartmentId: (departmentId) => set({ departmentId, shipperId: "" }),
  setShipperId: (shipperId) => set({ shipperId })
}));
