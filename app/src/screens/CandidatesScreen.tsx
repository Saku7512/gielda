import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  getCandidates,
  getSectorRankings,
  STRATEGY_LABELS,
  type Candidate,
  type Market,
  type SectorRanking,
} from "../services/api";

const MARKET_FILTERS: { value: Market | "ALL"; label: string }[] = [
  { value: "ALL", label: "Wszystkie" },
  { value: "PL", label: "Polska" },
  { value: "EU", label: "Europa" },
  { value: "US", label: "USA" },
];

function CandidateCard({ item }: { item: Candidate }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.symbol}>
          {item.symbol} <Text style={styles.marketTag}>{item.market}</Text>
        </Text>
        <Text style={styles.score}>
          {item.compositeScore.toFixed(1)}/{item.compositeScoreMax}
        </Text>
      </View>
      <View style={styles.strategyBadge}>
        <Text style={styles.strategyBadgeText}>{STRATEGY_LABELS[item.strategy]}</Text>
      </View>
      <Text style={styles.companyName}>
        {item.companyName} · {item.sector ?? "sektor nieznany"}
      </Text>
      <View style={styles.metricsRow}>
        <Text style={styles.metric}>Cena: {item.currentPrice.toFixed(2)}</Text>
        <Text style={styles.metric}>
          Fundamenty: {item.fundamentalAvailable && item.fundamentalHealthScore !== null
            ? `${item.fundamentalHealthScore.toFixed(0)}/100`
            : "brak danych"}
        </Text>
      </View>
      <Text style={styles.triggerDetail}>{item.triggerDetail}</Text>
      {item.aiReasoning && (
        <Text style={styles.reasoning}>
          {item.aiReasoning}
          {item.aiConfidence !== null ? ` (pewność AI: ${Math.round(item.aiConfidence * 100)}%)` : ""}
        </Text>
      )}
    </View>
  );
}

function SectorRankingCard({
  rankings,
  selectedSector,
  onSelectSector,
}: {
  rankings: SectorRanking[];
  selectedSector: string | null;
  onSelectSector: (sector: string | null) => void;
}) {
  if (rankings.length === 0) return null;

  return (
    <View style={styles.sectorCard}>
      <Text style={styles.sectorCardTitle}>Ranking branż</Text>
      {rankings.slice(0, 5).map((r) => {
        const isSelected = selectedSector === r.sector;
        return (
          <Pressable
            key={r.sector}
            onPress={() => onSelectSector(isSelected ? null : r.sector)}
            style={[styles.sectorRow, isSelected && styles.sectorRowSelected]}
          >
            <View style={styles.sectorRowHeader}>
              <Text style={styles.sectorRank}>#{r.rank}</Text>
              <Text style={styles.sectorName}>{r.sector}</Text>
              <Text style={styles.sectorScore}>{r.score.toFixed(0)}</Text>
            </View>
            <Text style={styles.sectorReasoning} numberOfLines={2}>
              {r.reasoning}
            </Text>
          </Pressable>
        );
      })}
      {selectedSector && (
        <Pressable onPress={() => onSelectSector(null)}>
          <Text style={styles.clearFilterText}>Wyczyść filtr branży ({selectedSector}) ✕</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function CandidatesScreen() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sectorRankings, setSectorRankings] = useState<SectorRanking[]>([]);
  const [marketFilter, setMarketFilter] = useState<Market | "ALL">("ALL");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [candidatesResult, rankingsResult] = await Promise.all([getCandidates(), getSectorRankings()]);
      setCandidates(candidatesResult);
      setSectorRankings(rankingsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredCandidates = useMemo(
    () =>
      candidates.filter(
        (c) => (marketFilter === "ALL" || c.market === marketFilter) && (sectorFilter === null || c.sector === sectorFilter)
      ),
    [candidates, marketFilter, sectorFilter]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Ładowanie kandydatów…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Błąd: {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={filteredCandidates.length === 0 ? styles.centered : undefined}
      data={filteredCandidates}
      keyExtractor={(item) => `${item.market}:${item.symbol}:${item.strategy}`}
      renderItem={({ item }) => <CandidateCard item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          <SectorRankingCard rankings={sectorRankings} selectedSector={sectorFilter} onSelectSector={setSectorFilter} />
          <View style={styles.marketFilterRow}>
            {MARKET_FILTERS.map((f) => {
              const isSelected = marketFilter === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setMarketFilter(f.value)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      ListEmptyComponent={<Text>Brak kandydatów dla wybranych filtrów.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#b00020",
    textAlign: "center",
  },
  marketFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#e6e6e6",
  },
  chipSelected: {
    backgroundColor: "#1a7f37",
  },
  chipText: {
    fontSize: 13,
    color: "#333",
  },
  chipTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  sectorCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectorCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectorRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
  },
  sectorRowSelected: {
    backgroundColor: "#f0f7f1",
  },
  sectorRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectorRank: {
    fontSize: 12,
    color: "#888",
    width: 24,
  },
  sectorName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  sectorScore: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a7f37",
  },
  sectorReasoning: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  clearFilterText: {
    marginTop: 8,
    fontSize: 12,
    color: "#1a7f37",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  symbol: {
    fontSize: 18,
    fontWeight: "700",
  },
  marketTag: {
    fontSize: 12,
    fontWeight: "400",
    color: "#888",
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a7f37",
  },
  strategyBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  strategyBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3949ab",
  },
  companyName: {
    color: "#555",
    marginTop: 6,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  metric: {
    fontSize: 13,
    color: "#333",
  },
  triggerDetail: {
    marginTop: 6,
    fontSize: 12,
    color: "#888",
  },
  reasoning: {
    marginTop: 8,
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
});
