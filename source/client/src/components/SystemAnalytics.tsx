import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { calculateStats, getRecentSearchEvents, type FieldTestingStats } from "@/lib/fieldTestingLogger";

export default function SystemAnalytics() {
  const [stats, setStats] = useState<FieldTestingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch routes
  const { data: routes = [] } = trpc.routes.list.useQuery();

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      try {
        // For now, load stats for the first route as a sample
        // In a real implementation, this would aggregate across all routes
        if (routes.length > 0) {
          const events = await getRecentSearchEvents(routes[0].id, 24);
          const calculatedStats = calculateStats(events);
          setStats(calculatedStats);
        }
      } catch (err) {
        console.error("[SystemAnalytics] Failed to load stats:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [routes]);

  if (isLoading) {
    return (
      <div className="p-6 bg-card rounded-lg border border-border text-center text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 bg-card rounded-lg border border-border text-center text-muted-foreground">
        No analytics data available yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Total Voice Searches</div>
              <div className="text-3xl font-bold text-foreground mt-2">{stats.totalSearches}</div>
            </div>
            <BarChart3 size={24} className="text-accent" />
          </div>
        </div>

        <div className="p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
              <div className="text-3xl font-bold text-foreground mt-2">
                {stats.totalSearches > 0
                  ? ((stats.successfulFirstTimeMatches / stats.totalSearches) * 100).toFixed(1)
                  : 0}
                %
              </div>
            </div>
            <TrendingUp size={24} className="text-accent" />
          </div>
        </div>

        <div className="p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Avg Response Time</div>
              <div className="text-3xl font-bold text-foreground mt-2">
                {stats.averageResponseTimeMs.toFixed(0)}ms
              </div>
            </div>
            <Clock size={24} className="text-accent" />
          </div>
        </div>

        <div className="p-4 bg-card rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Learned Mappings</div>
              <div className="text-3xl font-bold text-foreground mt-2">
                {stats.newLearnedMappingsCreated}
              </div>
            </div>
            <Users size={24} className="text-accent" />
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-card rounded-lg border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Search Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">First-time Matches</span>
              <span className="font-semibold text-foreground">{stats.successfulFirstTimeMatches}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Manual Corrections</span>
              <span className="font-semibold text-foreground">{stats.searchesRequiringManualCorrection}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Learned Mapping Used</span>
              <span className="font-semibold text-foreground">{stats.learnedMappingsUsedCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Fuzzy Matching Used</span>
              <span className="font-semibold text-foreground">{stats.fuzzyMatchingUsedCount}</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-card rounded-lg border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Performance</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg Response Time</span>
              <span className="font-semibold text-foreground">{stats.averageResponseTimeMs}ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Correction Rate</span>
              <span className="font-semibold text-foreground">
                {stats.totalSearches > 0
                  ? ((stats.searchesRequiringManualCorrection / stats.totalSearches) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* Common Errors */}
      {stats.commonSpeechErrors.size > 0 && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Top Speech Recognition Errors</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Transcript</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Occurrences</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(stats.commonSpeechErrors.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([transcript, count], idx) => (
                    <tr key={idx} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono text-xs text-foreground">
                        {transcript}
                      </td>
                      <td className="py-3 px-4 text-center text-foreground">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950 dark:border-blue-800">
        <h3 className="text-lg font-semibold text-foreground mb-3">Summary</h3>
        <div className="text-sm text-foreground space-y-2">
          <p>
            Route Intelligence has processed <strong>{stats.totalSearches}</strong> voice searches with a{" "}
            <strong>
              {stats.totalSearches > 0
                ? ((stats.successfulFirstTimeMatches / stats.totalSearches) * 100).toFixed(1)
                : 0}
              %
            </strong>{" "}
            success rate on first-time matches.
          </p>
          <p>
            <strong>{stats.newLearnedMappingsCreated}</strong> new learned mappings have been created
            through manual corrections, improving accuracy for future searches.
          </p>
          <p>
            Average response time is <strong>{stats.averageResponseTimeMs.toFixed(0)}ms</strong>, ensuring
            fast and responsive voice search during delivery operations.
          </p>
        </div>
      </div>
    </div>
  );
}
