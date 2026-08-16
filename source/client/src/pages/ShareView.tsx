import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import StopCard from "@/components/StopCard";
import { Search, X } from "lucide-react";
import type { Stop } from "../../../drizzle/schema";
import { matchesQuery } from "@/lib/matching";

export default function ShareView() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const { data, isLoading, error } = trpc.routes.getPublicSummary.useQuery(
    { token },
    { enabled: !!token }
  );

  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const sections = data?.sections ?? [];
  const allStops = data?.stops ?? [];

  const currentSectionId = activeSectionId ?? sections[0]?.id ?? 0;

  const sectionStops = useMemo(
    () => allStops.filter(s => s.sectionId === currentSectionId),
    [allStops, currentSectionId]
  );

  const filteredStops = useMemo(() => {
    if (!searchQuery.trim()) return sectionStops;
    return sectionStops.filter(s => matchesQuery(s, searchQuery.trim()));
  }, [sectionStops, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading route…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Route not found</p>
          <p className="text-sm text-muted-foreground mt-1">
            This share link may be invalid or expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-30 shadow-md">
        <div className="px-3 py-2.5">
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            {data.route.name}
          </h1>
          <p className="text-xs opacity-75">Substitute / Relief View — Read Only</p>
        </div>

        {/* ── Section tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3 pb-2">
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => { setActiveSectionId(sec.id); setSearchQuery(""); }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
                sec.id === currentSectionId
                  ? "bg-accent text-accent-foreground shadow"
                  : "bg-white/10 text-primary-foreground hover:bg-white/20"
              }`}
            >
              {sec.boxNumber}. {sec.name}
            </button>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search residents, aliases…"
              className="w-full pl-8 pr-8 py-1.5 rounded-full text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Stop count ── */}
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {filteredStops.length} of {sectionStops.length} stops
      </div>

      {/* ── Stop cards ── */}
      <main className="flex-1 px-3 pb-6 space-y-2">
        {filteredStops.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No stops found</p>
          </div>
        ) : (
          filteredStops.map(stop => (
            <StopCard key={stop.id} stop={stop} searchQuery={searchQuery} />
          ))
        )}
      </main>
    </div>
  );
}
