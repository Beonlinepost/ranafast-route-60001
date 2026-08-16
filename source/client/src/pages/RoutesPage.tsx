import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import type { Route } from "../../../drizzle/schema";

export default function RoutesPage() {
  const { data: routesList = [], isLoading } = trpc.routes.list.useQuery();
  const [, navigate] = useLocation();

  // If only one route, auto-navigate to it
  useEffect(() => {
    if (!isLoading && routesList.length === 1) {
      navigate(`/route/${routesList[0]!.id}`);
    }
  }, [routesList, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-background/80 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            📮 Post Routes
          </h1>
          <p className="text-muted-foreground">Select a route to manage deliveries</p>
        </div>

        {/* Routes Grid */}
        {routesList.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No routes available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {routesList.map((route: Route) => (
              <button
                key={route.id}
                onClick={() => navigate(`/route/${route.id}`)}
                type="button"
                className="w-full flex items-center justify-between p-5 bg-card border border-border rounded-lg hover:border-primary hover:shadow-md hover:bg-primary/5 transition-all group"
              >
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {route.name}
                  </h2>
                  {route.description ? (
                    <p className="text-sm text-muted-foreground mt-1">{route.description}</p>
                  ) : null}
                </div>
                <ChevronRight className="text-muted-foreground group-hover:text-primary transition-colors" size={24} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
