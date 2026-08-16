import { useEffect, useState } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getRecentSearchEvents,
  calculateStats,
  generateDailySummary,
  exportAsJSON,
  exportAsCSV,
  clearSearchEvents,
  type SearchEvent,
} from "@/lib/fieldTestingLogger";

interface Props {
  routeId: number;
  hoursAgo?: number;
}

export default function FieldTestingDashboard({ routeId, hoursAgo = 24 }: Props) {
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<string>("");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await generateDailySummary(routeId, hoursAgo);
      setEvents(result.events);
      setSummary(result.summary);
    } catch (err) {
      console.error("[Dashboard] Failed to load data:", err);
      toast.error("Failed to load field testing data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [routeId, hoursAgo]);

  const stats = calculateStats(events);

  const handleExportJSON = () => {
    try {
      const json = exportAsJSON(events);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `field-test-${routeId}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Exported as JSON");
    } catch (err) {
      console.error("[Dashboard] Export JSON failed:", err);
      toast.error("Failed to export JSON");
    }
  };

  const handleExportCSV = () => {
    try {
      const csv = exportAsCSV(events);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `field-test-${routeId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Exported as CSV");
    } catch (err) {
      console.error("[Dashboard] Export CSV failed:", err);
      toast.error("Failed to export CSV");
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear all field testing data for this route?")) return;

    try {
      await clearSearchEvents(routeId);
      setEvents([]);
      setSummary("");
      toast.success("Cleared all field testing data");
    } catch (err) {
      console.error("[Dashboard] Clear failed:", err);
      toast.error("Failed to clear data");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-background rounded-lg border border-border">
        <div className="text-center text-muted-foreground">Loading field test data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Report */}
      <div className="p-6 bg-background rounded-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Field Testing Summary</h3>
          <button
            onClick={loadData}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-96 font-mono whitespace-pre-wrap break-words">
          {summary || "No data yet"}
        </pre>
      </div>

      {/* Statistics Grid */}
      {events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Total Searches</div>
            <div className="text-3xl font-bold">{stats.totalSearches}</div>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Success Rate</div>
            <div className="text-3xl font-bold">
              {Math.round((stats.successfulFirstTimeMatches / stats.totalSearches) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.successfulFirstTimeMatches} first-time matches
            </div>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Manual Corrections</div>
            <div className="text-3xl font-bold">
              {Math.round((stats.searchesRequiringManualCorrection / stats.totalSearches) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.searchesRequiringManualCorrection} corrections
            </div>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Avg Response Time</div>
            <div className="text-3xl font-bold">{stats.averageResponseTimeMs}ms</div>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Learned Mappings Used</div>
            <div className="text-3xl font-bold">
              {Math.round((stats.learnedMappingsUsedCount / stats.totalSearches) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.learnedMappingsUsedCount} searches
            </div>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">Fuzzy Matching Used</div>
            <div className="text-3xl font-bold">
              {Math.round((stats.fuzzyMatchingUsedCount / stats.totalSearches) * 100)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.fuzzyMatchingUsedCount} searches
            </div>
          </div>
        </div>
      )}

      {/* Common Errors */}
      {stats.commonSpeechErrors.size > 0 && (
        <div className="p-6 bg-background rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-4">Most Common Speech Recognition Errors</h3>
          <div className="space-y-2">
            {Array.from(stats.commonSpeechErrors.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([transcript, count]) => (
                <div key={transcript} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <code className="text-sm">{transcript}</code>
                  <span className="text-sm font-semibold">{count}x</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleExportJSON}
          disabled={events.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} />
          Export JSON
        </button>

        <button
          onClick={handleExportCSV}
          disabled={events.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>

        <button
          onClick={handleClear}
          disabled={events.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
        >
          <Trash2 size={16} />
          Clear Data
        </button>
      </div>

      {events.length === 0 && (
        <div className="p-6 bg-muted rounded-lg text-center text-muted-foreground">
          No field testing data yet. Start a voice search to begin logging metrics.
        </div>
      )}
    </div>
  );
}
