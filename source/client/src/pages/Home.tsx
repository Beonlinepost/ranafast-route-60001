import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      navigate("/routes");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm">
        {/* Logo mark */}
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
          <span className="text-2xl">📮</span>
        </div>

        <h1
          className="text-3xl font-bold text-primary mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Maghery Route
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          An Post delivery route tool for Maghery, Co. Donegal
        </p>

        <a
          href={getLoginUrl()}
          className="inline-flex items-center justify-center w-full bg-primary text-primary-foreground font-semibold py-3 px-6 rounded-full shadow hover:opacity-90 transition-opacity"
        >
          Sign in to view route
        </a>

        <p className="text-xs text-muted-foreground mt-4">
          Relief postmen — use the share link provided by your supervisor.
        </p>
      </div>
    </div>
  );
}
