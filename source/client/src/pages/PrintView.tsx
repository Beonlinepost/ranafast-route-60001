import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import type { Stop } from "../../../drizzle/schema";

function splitPipe(val: string | null | undefined): string[] {
  if (!val) return [];
  return val.split("|").map(s => s.trim()).filter(Boolean);
}

function SideBadge({ side }: { side: string | null | undefined }) {
  if (!side) return null;
  const s = side.trim().toLowerCase();
  const label = (s === "left" || s === "l") ? "L" : (s === "right" || s === "r") ? "R" : side;
  const cls = (s === "left" || s === "l")
    ? "bg-blue-100 text-blue-800"
    : "bg-emerald-100 text-emerald-800";
  return <span className={`inline-block px-1 rounded text-xs font-bold ${cls}`}>{label}</span>;
}

function StopRow({ stop }: { stop: Stop }) {
  const residents = splitPipe(stop.residents);
  const aliases   = splitPipe(stop.aliases);
  return (
    <tr className="border-b border-gray-200 text-xs">
      <td className="py-1 pr-2 text-right text-gray-500 w-6">{stop.stopOrder}</td>
      <td className="py-1 pr-2"><SideBadge side={stop.side} /></td>
      <td className="py-1 pr-2">
        <div className="font-semibold">{residents[0] ?? ""}</div>
        {residents.slice(1).map((r, i) => (
          <div key={i} className="text-gray-500">{r}</div>
        ))}
        {aliases.length > 0 && (
          <div className="text-gray-400 italic text-xs">{aliases.join(", ")}</div>
        )}
      </td>
      <td className="py-1 pr-2 text-gray-500">{stop.road}</td>
      <td className="py-1 pr-2 font-mono text-gray-500">{stop.eircode}</td>
      <td className="py-1 text-gray-600">
        {stop.hasDog && <span className="text-red-600 font-bold mr-1">DOG</span>}
        {stop.notes}
      </td>
    </tr>
  );
}

export default function PrintView() {
  const { data: route } = trpc.routes.getDefault.useQuery();
  const routeId = route?.id ?? 0;

  const { data: sections = [] } = trpc.sections.list.useQuery(
    { routeId },
    { enabled: routeId > 0 }
  );

  // Load all stops for all sections
  const { data: allStops = [] } = trpc.stops.listAll.useQuery(
    { routeId },
    { enabled: routeId > 0 }
  );

  const stopsBySection = (sectionId: number) =>
    allStops.filter(s => s.sectionId === sectionId).sort((a, b) => a.stopOrder - b.stopOrder);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Screen-only controls ── */}
      <div className="no-print flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground sticky top-0 z-10">
        <Link href="/">
          <button className="p-1.5 rounded-full hover:bg-white/10">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <span className="flex-1 font-semibold text-sm">Print View</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-accent text-accent-foreground px-3 py-1.5 rounded-full text-sm font-semibold"
        >
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* ── Title ── */}
        <div className="mb-6 border-b-2 border-primary pb-4">
          <h1 className="text-2xl font-bold text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
            {route?.name ?? "Maghery Route"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sections.length} sections · {allStops.length} stops
          </p>
        </div>

        {/* ── Section index ── */}
        <div className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Section Index
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {sections.map(sec => (
              <div key={sec.id} className="flex items-baseline gap-2 text-sm">
                <span className="font-bold text-primary w-6 text-right shrink-0">{sec.boxNumber}</span>
                <span className="text-foreground">{sec.name}</span>
                <span className="text-muted-foreground text-xs ml-auto">
                  {stopsBySection(sec.id).length} stops
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Per-section stop tables ── */}
        {sections.map(sec => {
          const secStops = stopsBySection(sec.id);
          return (
            <div key={sec.id} className="print-section mb-8">
              <h2 className="text-base font-bold text-primary mb-2 border-b border-primary pb-1"
                style={{ fontFamily: "'Playfair Display', serif" }}>
                Box {sec.boxNumber} — {sec.name}
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({secStops.length} stops)
                </span>
              </h2>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300 text-left text-gray-500 uppercase tracking-wide">
                    <th className="py-1 pr-2 w-6">#</th>
                    <th className="py-1 pr-2 w-6">Side</th>
                    <th className="py-1 pr-2">Residents / Aliases</th>
                    <th className="py-1 pr-2">Road</th>
                    <th className="py-1 pr-2">Eircode</th>
                    <th className="py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {secStops.map(stop => (
                    <StopRow key={stop.id} stop={stop} />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
