import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import VetShell from "./VetShell";
import { useLowerHeaderMotion } from "./useLowerHeaderMotion";
import {
  getInventoryItems,
  getInventorySummary,
  subscribeToInventory,
} from "../../../services/inventoryService";

const inventoryIcon = require("../../assets/Inventory_Icon.png");
const medicalIcon = require("../../assets/Medical_Icon.png");
const logIcon = require("../../assets/Log_Icon.png");

function fmtQty(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("out") || value.includes("expired")) return styles.badgeDanger;
  if (value.includes("low") || value.includes("near")) return styles.badgeWarning;
  return styles.badgeGood;
}

function itemIcon(item) {
  const value = `${item?.category || ""} ${item?.item_name || ""}`.toLowerCase();
  if (value.includes("vaccine")) return inventoryIcon;
  if (value.includes("medicine") || value.includes("drug") || value.includes("tablet")) return medicalIcon;
  return logIcon;
}

export default function VetInventory({ navigation, route }) {
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadInventory = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const rows = await getInventoryItems();
      setItems(rows);
    } catch (e) {
      setError(e?.message || "Unable to load inventory.");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
    const unsubscribe = subscribeToInventory(() => loadInventory({ silent: true }));
    const fallback = setInterval(() => loadInventory({ silent: true }), 30000);
    return () => {
      unsubscribe?.();
      clearInterval(fallback);
    };
  }, [loadInventory]);

  const summary = useMemo(() => getInventorySummary(items), [items]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [item.item_name, item.category, item.sku, item.supplier_name, item.batch_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [items, search]);

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Inventory"
      caption="Clinical Supplies"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadInventory({ silent: true });
            }}
          />
        }
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Inventory Overview</Text>
          <Text style={styles.heroText}>
            Live clinic stock from the same inventory used by the PawCruz web system.
          </Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.totalItems}</Text>
              <Text style={styles.summaryLabel}>Items</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.lowStock}</Text>
              <Text style={styles.summaryLabel}>Low Stock</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.outOfStock}</Text>
              <Text style={styles.summaryLabel}>Out of Stock</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.expiringSoon}</Text>
              <Text style={styles.summaryLabel}>Expiring Soon</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.sectionTitle}>Clinical Supplies</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search item, category, SKU..."
            placeholderTextColor="#8aa2b0"
            style={styles.searchInput}
          />
          <Text style={styles.resultText}>
            {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"} shown
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Inventory unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadInventory()}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2d8fb6" />
            <Text style={styles.loadingText}>Loading live inventory...</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.iconWrap}>
                <Image source={itemIcon(item)} style={styles.icon} resizeMode="contain" />
              </View>

              <View style={styles.itemTextWrap}>
                <View style={styles.itemTopRow}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {item.item_name || "Unnamed Item"}
                  </Text>
                  <View style={[styles.statusBadge, statusTone(item.status)]}>
                    <Text style={styles.statusText}>{item.status || "In Stock"}</Text>
                  </View>
                </View>

                <Text style={styles.itemSubtitle}>
                  {item.category || "Clinic Supply"}
                  {item.sku ? `  •  ${item.sku}` : ""}
                </Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Available</Text>
                  <Text style={styles.detailValue}>
                    {fmtQty(item.quantity)} {item.unit || "pcs"}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reorder level</Text>
                  <Text style={styles.detailValue}>
                    {fmtQty(item.reorder_level)} {item.unit || "pcs"}
                  </Text>
                </View>

                {item.expiry_date ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Expiry</Text>
                    <Text style={styles.detailValue}>{item.expiry_date}</Text>
                  </View>
                ) : null}

                {item.supplier_name ? (
                  <Text style={styles.supplierText}>Supplier: {item.supplier_name}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        {!loading && !error && filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No inventory items found</Text>
            <Text style={styles.emptyText}>
              {search ? "Try a different search." : "Inventory added on the web will appear here automatically."}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroCard: {
    backgroundColor: "#fcfeff",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#dceef8",
    padding: 18,
    marginBottom: 14,
  },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#24566d" },
  heroText: { marginTop: 6, fontSize: 13, lineHeight: 20, fontWeight: "600", color: "#5d7b91" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 },
  summaryCard: {
    width: "48.5%",
    minHeight: 78,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#eef9fc",
    borderWidth: 1,
    borderColor: "#d9edf4",
  },
  summaryValue: { fontSize: 23, fontWeight: "900", color: "#24566d" },
  summaryLabel: { marginTop: 3, fontSize: 11.5, fontWeight: "700", color: "#648293" },
  searchCard: {
    backgroundColor: "#fcfeff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dceef8",
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "900", color: "#24566d", marginBottom: 10 },
  searchInput: {
    minHeight: 46,
    backgroundColor: "#f5fbfd",
    borderWidth: 1,
    borderColor: "#d7eaf2",
    borderRadius: 14,
    paddingHorizontal: 14,
    color: "#24566d",
    fontSize: 13,
    fontWeight: "600",
  },
  resultText: { marginTop: 8, color: "#7995a3", fontSize: 11.5, fontWeight: "700" },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fcfeff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dceef8",
    padding: 14,
    marginBottom: 12,
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: "#e7f6f8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  icon: { width: 24, height: 24, tintColor: "#24566d" },
  itemTextWrap: { flex: 1, minWidth: 0 },
  itemTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "900", color: "#24566d" },
  itemSubtitle: { marginTop: 5, marginBottom: 10, fontSize: 11.5, lineHeight: 17, fontWeight: "700", color: "#718e9d" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  badgeGood: { backgroundColor: "#e2f5e9" },
  badgeWarning: { backgroundColor: "#fff1cf" },
  badgeDanger: { backgroundColor: "#fde4e5" },
  statusText: { fontSize: 9.5, fontWeight: "900", color: "#3d687a" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 5 },
  detailLabel: { fontSize: 11.5, fontWeight: "700", color: "#8199a5" },
  detailValue: { fontSize: 11.5, fontWeight: "900", color: "#315f73", textAlign: "right" },
  supplierText: { marginTop: 9, fontSize: 11, lineHeight: 16, fontWeight: "600", color: "#76909e" },
  loadingCard: { paddingVertical: 36, alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 12, fontWeight: "700", color: "#6d8998" },
  errorCard: {
    backgroundColor: "#fff7f7",
    borderColor: "#f1d8d9",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  errorTitle: { fontSize: 14, fontWeight: "900", color: "#8d4b50" },
  errorText: { marginTop: 5, fontSize: 12, lineHeight: 18, color: "#9d666a" },
  retryButton: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: "#2f91ba" },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  emptyCard: {
    padding: 24,
    borderRadius: 22,
    backgroundColor: "#fcfeff",
    borderWidth: 1,
    borderColor: "#dceef8",
    alignItems: "center",
  },
  emptyTitle: { fontSize: 15, fontWeight: "900", color: "#315f73" },
  emptyText: { marginTop: 6, fontSize: 12, lineHeight: 18, textAlign: "center", color: "#7b96a4" },
});
