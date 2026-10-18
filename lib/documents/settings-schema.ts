import { z } from "zod";
import { LAYOUT_KEYS } from "@/lib/documents/layout-meta";
import type { LayoutKey } from "@/lib/types/document-template";

export const approvalLineSchema = z.object({ label: z.string().trim().min(1).max(10) });

export const documentSettingsSchema = z
  .object({
    headerTitle: z.string().trim().min(1).max(60),
    headerSubtitle: z.string().max(100).optional(),
    companyName: z.string().max(60).optional(),
    footerNote: z.string().max(500).optional(),
    approvalLines: z.array(approvalLineSchema).max(5),
    code: z.object({
      type: z.enum(["qr", "code128", "none"]),
      position: z.enum(["header-right", "footer"])
    }),
    sections: z.object({
      products: z.boolean(),
      materials: z.boolean(),
      memo: z.boolean(),
      signature: z.boolean()
    }),
    blankRows: z.number().int().min(0).max(10).optional(),
    showInspectionMethod: z.boolean().optional(),
    showLotCheckbox: z.boolean().optional()
  })
  .strip();

export const layoutKeySchema = z.enum(LAYOUT_KEYS as [LayoutKey, ...LayoutKey[]]);
