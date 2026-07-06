"use client";

import { create } from "zustand";

type FilterState = {
  departmentId: string;
  shipperId: string;
  setDepartmentId: (departmentId: string) => void;
  setShipperId: (shipperId: string) => void;
};

export const useFilterStore = create<FilterState>((set) => ({
  departmentId: "dept-fulfillment",
  shipperId: "shipper-mint",
  setDepartmentId: (departmentId) => set({ departmentId, shipperId: "" }),
  setShipperId: (shipperId) => set({ shipperId })
}));
