import { useState } from "react";
import { BarChart3, Settings, Zap, TrendingUp } from "lucide-react";
import FieldTestingDashboard from "@/components/FieldTestingDashboard";
import LearnedMappingsManager from "@/components/LearnedMappingsManager";
import RouteIntelligenceConfig from "@/components/RouteIntelligenceConfig";
import SystemAnalytics from "@/components/SystemAnalytics";

type TabType = "field-testing" | "learned-mappings" | "ri-config" | "analytics";

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("field-testing");

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: React.ReactNode;
    description: string;
  }> = [
    {
      id: "field-testing",
      label: "Field Testing",
      icon: <BarChart3 size={20} />,
      description: "Monitor Route Intelligence performance metrics",
    },
    {
      id: "learned-mappings",
      label: "Learned Mappings",
      icon: <Zap size={20} />,
      description: "Manage speech recognition corrections",
    },
    {
      id: "ri-config",
      label: "Route Intelligence",
      icon: <Settings size={20} />,
      description: "Configure search engine settings",
    },
    {
      id: "analytics",
      label: "System Analytics",
      icon: <TrendingUp size={20} />,
      description: "View cross-route statistics",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">
            Manage Route Intelligence, field testing, and system configuration
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-accent text-accent font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                title={tab.description}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === "field-testing" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">Field Testing Dashboard</h2>
              <p className="text-muted-foreground mt-1">
                Monitor Route Intelligence performance during live testing on Ranafast (Test) route
              </p>
            </div>
            <FieldTestingDashboard routeId={0} hoursAgo={24} />
          </div>
        )}

        {activeTab === "learned-mappings" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">Learned Mappings Management</h2>
              <p className="text-muted-foreground mt-1">
                View, edit, and delete learned speech recognition corrections per route
              </p>
            </div>
            <LearnedMappingsManager />
          </div>
        )}

        {activeTab === "ri-config" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">Route Intelligence Configuration</h2>
              <p className="text-muted-foreground mt-1">
                Configure search engine behavior, thresholds, and feature flags
              </p>
            </div>
            <RouteIntelligenceConfig />
          </div>
        )}

        {activeTab === "analytics" && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">System Analytics</h2>
              <p className="text-muted-foreground mt-1">
                View cross-route statistics and performance metrics
              </p>
            </div>
            <SystemAnalytics />
          </div>
        )}
      </div>
    </div>
  );
}
