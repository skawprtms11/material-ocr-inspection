import { text, type DbRow, type ServerSupabase } from "@/lib/server/work-register-shared";

// 작업마스터 제품 구성. work_components가 없는 작업의 폴백 원천(작업현황 상세·작업지시서 공용).
export async function loadWorkMasterProductRows(supabase: ServerSupabase, workMasterId: string) {
  const { data, error } = await supabase
    .from("work_master_products")
    .select("product_code, product_name, unit_quantity, product_type, sort_order")
    .eq("work_master_id", workMasterId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DbRow[];
}

// 작업마스터 부자재 매핑(검수순) + 해당 자재마스터.
export async function loadWorkMasterMaterialRows(supabase: ServerSupabase, workMasterId: string) {
  const { data: mappingRows, error: mappingError } = await supabase
    .from("work_master_materials")
    .select("*")
    .eq("work_master_id", workMasterId)
    .order("inspection_order", { ascending: true });
  if (mappingError) throw mappingError;

  const mappings = (mappingRows ?? []) as DbRow[];
  const materialIds = mappings.map((row) => text(row.material_id)).filter(Boolean);

  const { data: materialRows, error: materialError } =
    materialIds.length > 0
      ? await supabase.from("material_masters").select("*").in("id", materialIds)
      : { data: [] as DbRow[], error: null };
  if (materialError) throw materialError;

  const materialById = new Map(((materialRows ?? []) as DbRow[]).map((row) => [text(row.id), row]));
  return { mappings, materialById };
}
