import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import {
  DEFAULT_TRADABLE_PAIRS,
  ASSET_CLASS,
  ASSET_CLASS_LABELS,
  ensureTradablePairs,
} from "@/lib/assetConfig";

export default function TradablePairsManager() {
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAssetClass, setNewAssetClass] = useState(ASSET_CLASS.CRYPTO);
  const [saving, setSaving] = useState(false);
  const [filterClass, setFilterClass] = useState("all");

  const fetchPairs = async () => {
    setLoading(true);
    const data = await ensureTradablePairs(base44.entities.TradablePair);
    setPairs(data);
    setLoading(false);
  };

  useEffect(() => { fetchPairs(); }, []);

  const toggleEnabled = async (pair) => {
    await base44.entities.TradablePair.update(pair.id, { enabled: !pair.enabled });
    setPairs(p => p.map(x => x.id === pair.id ? { ...x, enabled: !x.enabled } : x));
  };

  const deletePair = async (pair) => {
    await base44.entities.TradablePair.delete(pair.id);
    setPairs(p => p.filter(x => x.id !== pair.id));
  };

  const addPair = async () => {
    if (!newSymbol || !newLabel) return;
    setSaving(true);
    const sym = newAssetClass === ASSET_CLASS.CRYPTO
      ? newSymbol.toUpperCase().replace("/", "")
      : newSymbol.toUpperCase();
    const created = await base44.entities.TradablePair.create({
      symbol: sym,
      display_name: newLabel,
      asset_class: newAssetClass,
      enabled: true,
      sort_order: pairs.length,
    });
    setPairs(p => [...p, created]);
    setNewSymbol("");
    setNewLabel("");
    setSaving(false);
  };

  const filtered = filterClass === "all"
    ? pairs
    : pairs.filter(p => (p.asset_class || ASSET_CLASS.CRYPTO) === filterClass);

  const classCounts = pairs.reduce((acc, p) => {
    const cls = p.asset_class || ASSET_CLASS.CRYPTO;
    acc[cls] = (acc[cls] || 0) + 1;
    return acc;
  }, {});

  if (loading) return <div className="text-sm text-muted-foreground animate-pulse p-4">Loading pairs…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tradable Assets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage assets across Crypto, Forex, Commodities, and US Stocks
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {pairs.length} total · {pairs.filter(p => p.enabled).length} enabled
        </div>
      </div>

      {/* Asset class filter tabs */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setFilterClass("all")}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            filterClass === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({pairs.length})
        </button>
        {Object.entries(ASSET_CLASS_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterClass(key)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              filterClass === key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label} ({classCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Pairs list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Symbol</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Display Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Class</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Enabled</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((pair) => (
              <tr key={pair.id} className="border-b border-border last:border-0 hover:bg-card/50 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded">{pair.symbol}</span>
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{pair.display_name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    (pair.asset_class || ASSET_CLASS.CRYPTO) === ASSET_CLASS.CRYPTO ? "bg-orange-500/10 text-orange-400" :
                    pair.asset_class === ASSET_CLASS.FX ? "bg-blue-500/10 text-blue-400" :
                    pair.asset_class === ASSET_CLASS.COMMODITIES ? "bg-yellow-500/10 text-yellow-400" :
                    "bg-green-500/10 text-green-400"
                  }`}>
                    {ASSET_CLASS_LABELS[pair.asset_class || ASSET_CLASS.CRYPTO]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleEnabled(pair)} className="transition-colors">
                    {pair.enabled
                      ? <ToggleRight className="w-5 h-5 text-primary inline" />
                      : <ToggleLeft className="w-5 h-5 text-muted-foreground inline" />}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deletePair(pair)}
                    className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add new pair */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add New Asset</p>
        <div className="flex gap-2 flex-wrap">
          <select
            value={newAssetClass}
            onChange={e => setNewAssetClass(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {Object.entries(ASSET_CLASS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Symbol (e.g. DOGEUSDT, EUR/USD, AAPL)"
            value={newSymbol}
            onChange={e => setNewSymbol(e.target.value)}
            className="flex-1 min-w-32 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Label (e.g. DOGE/USDT, EUR/USD, Apple)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className="flex-1 min-w-32 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button
            size="sm"
            onClick={addPair}
            disabled={!newSymbol || !newLabel || saving}
            className="gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Crypto: Binance symbol (e.g. <span className="font-mono">LINKUSDT</span>) ·
          FX: pair format (e.g. <span className="font-mono">EUR/USD</span>) ·
          Stocks: ticker (e.g. <span className="font-mono">AAPL</span>)
        </p>
      </div>
    </div>
  );
}
