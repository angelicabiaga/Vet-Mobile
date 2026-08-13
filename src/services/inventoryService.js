import { supabase } from "../config/supabaseClient";

const ITEM_FIELDS =
  "id,item_name,category,sku,description,quantity,unit,unit_price,reorder_level,expiry_date,supplier_name,batch_number,status,is_archived,created_at,updated_at";

function friendly(error, fallback) {
  console.error(fallback, error);
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return new Error("Inventory is unavailable. Run the PawCruz inventory SQL in Supabase.");
  }
  return new Error(error?.message || fallback);
}

export async function getInventoryItems() {
  const { data, error } = await supabase
    .from("inventory_items")
    .select(ITEM_FIELDS)
    .eq("is_archived", false)
    .order("item_name", { ascending: true });

  if (error) throw friendly(error, "Unable to load inventory.");
  return data || [];
}

export function getInventorySummary(items = []) {
  const rows = (items || []).filter((item) => !item?.is_archived);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nearExpiry = new Date(today);
  nearExpiry.setDate(nearExpiry.getDate() + 30);

  const isNearExpiry = (value) => {
    if (!value) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date >= today && date <= nearExpiry;
  };

  return {
    totalItems: rows.length,
    totalUnits: rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    lowStock: rows.filter(
      (item) =>
        Number(item.quantity || 0) > 0 &&
        Number(item.quantity || 0) <= Number(item.reorder_level || 0)
    ).length,
    outOfStock: rows.filter((item) => Number(item.quantity || 0) <= 0).length,
    expiringSoon: rows.filter(
      (item) => String(item.status || "").toLowerCase() === "near expiry" || isNearExpiry(item.expiry_date)
    ).length,
  };
}

export function subscribeToInventory(onChange) {
  const channel = supabase
    .channel(`mobile-inventory-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inventory_items" },
      () => onChange?.()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
