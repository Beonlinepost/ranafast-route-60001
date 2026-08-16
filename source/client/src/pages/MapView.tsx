import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

// ── Singleton Google Maps loader ──────────────────────────────────────────────
const MAPS_PROXY_URL = (import.meta as any).env?.VITE_FRONTEND_FORGE_API_URL
  ? `${(import.meta as any).env.VITE_FRONTEND_FORGE_API_URL}/maps-proxy`
  : "/api/maps-proxy";

let _mapScriptPromise: Promise<void> | null = null;

function loadMapScript(): Promise<void> {
  if (_mapScriptPromise) return _mapScriptPromise;
  if ((window as any).google?.maps) {
    _mapScriptPromise = Promise.resolve();
    return _mapScriptPromise;
  }
  _mapScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?v=weekly`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      _mapScriptPromise = null;
      reject(new Error("Google Maps script failed to load"));
    };
    document.head.appendChild(script);
  });
  return _mapScriptPromise;
}

// Section colours (cycling through 10 distinct colours)
const SECTION_COLOURS = [
  "#1a3a5c", "#b8860b", "#1e6b3c", "#8b1a1a", "#2e4a7a",
  "#7a4a1a", "#1a5c5c", "#5c1a5c", "#3c5c1a", "#5c3c1a",
];

export default function MapView() {
  const { data: route } = trpc.routes.getDefault.useQuery();
  const routeId = route?.id ?? 0;

  const { data: sections = [] } = trpc.sections.list.useQuery(
    { routeId },
    { enabled: routeId > 0 }
  );

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Load all stops for all sections
  const { data: allStops = [] } = trpc.stops.listAll.useQuery(
    { routeId },
    { enabled: routeId > 0 }
  );

  const initMap = useCallback(async () => {
    try {
      await loadMapScript();
      if (!mapRef.current) return;
      const google = (window as any).google;
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 54.95, lng: -8.15 },
        zoom: 12,
        mapTypeId: "roadmap",
        mapTypeControl: true,
        mapTypeControlOptions: {
          mapTypeIds: ["roadmap", "satellite", "hybrid"],
        },
        streetViewControl: true,
        fullscreenControl: false,
      });
      mapInstanceRef.current = map;
      setMapReady(true);
    } catch (e) {
      setMapError("Map failed to load. Please check your connection.");
    }
  }, []);

  useEffect(() => {
    initMap();
  }, [initMap]);

  // Place markers when map is ready and stops are loaded
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || allStops.length === 0) return;
    const google = (window as any).google;
    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    allStops.forEach((stop, idx) => {
      if (!stop.lat || !stop.lng) return;
      const lat = parseFloat(stop.lat);
      const lng = parseFloat(stop.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const sectionIdx = sections.findIndex(s => s.id === stop.sectionId);
      const colour = SECTION_COLOURS[sectionIdx % SECTION_COLOURS.length] ?? "#1a3a5c";

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: `#${stop.stopOrder} — ${stop.residents?.split("|")[0] ?? ""}`,
        label: {
          text: String(stop.stopOrder),
          color: "#fff",
          fontSize: "10px",
          fontWeight: "bold",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: colour,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 1.5,
          scale: 10,
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="font-family:Inter,sans-serif;max-width:220px;font-size:13px">
            <strong>#${stop.stopOrder} ${stop.side ?? ""}</strong><br/>
            ${(stop.residents ?? "").split("|").map(r => r.trim()).join("<br/>")}
            ${stop.notes ? `<p style="margin:4px 0 0;color:#666;font-size:11px">${stop.notes}</p>` : ""}
            ${stop.eircode ? `<p style="margin:2px 0 0;font-size:11px;color:#888">${stop.eircode}</p>` : ""}
            <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" style="display:inline-block;margin-top:6px;font-size:11px;color:#1a3a5c">Street View ↗</a>
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
      bounds.extend({ lat, lng });
      hasCoords = true;
    });

    if (hasCoords) {
      map.fitBounds(bounds, 40);
    }
  }, [mapReady, allStops, sections]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground px-3 py-2.5 flex items-center gap-3 sticky top-0 z-30 shadow-md no-print">
        <Link href="/">
          <button className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <div>
          <h1 className="text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Route Map
          </h1>
          <p className="text-xs opacity-75">{sections.length} sections · {allStops.filter(s => s.lat).length} geocoded stops</p>
        </div>
      </header>

      {/* Section colour legend */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 py-2 bg-white border-b no-print">
        {sections.map((sec, idx) => (
          <div key={sec.id} className="flex items-center gap-1 shrink-0">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: SECTION_COLOURS[idx % SECTION_COLOURS.length] }}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {sec.boxNumber}. {sec.name}
            </span>
          </div>
        ))}
      </div>

      {mapError ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-muted-foreground text-center">{mapError}</p>
        </div>
      ) : (
        <div ref={mapRef} className="flex-1" style={{ minHeight: "calc(100vh - 120px)" }} />
      )}
    </div>
  );
}
