import { useState, useEffect } from "react";
import { Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface RIConfig {
  enabled: boolean;
  fuzzyMatchingThreshold: number; // 0-1
  learnedMappingConfidenceThreshold: number; // 0-1
  enableAliasMatching: boolean;
  enableBroadFallback: boolean;
  maxFuzzyResults: number;
}

const DEFAULT_CONFIG: RIConfig = {
  enabled: true,
  fuzzyMatchingThreshold: 0.6,
  learnedMappingConfidenceThreshold: 0.5,
  enableAliasMatching: true,
  enableBroadFallback: true,
  maxFuzzyResults: 10,
};

export default function RouteIntelligenceConfig() {
  const [config, setConfig] = useState<RIConfig>(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("routeIntelligenceConfig");
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (err) {
      console.error("[RIConfig] Failed to load config:", err);
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem("routeIntelligenceConfig", JSON.stringify(config));
      toast.success("Configuration saved");
      setIsDirty(false);
    } catch (err) {
      console.error("[RIConfig] Failed to save config:", err);
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm("Reset to default configuration?")) {
      setConfig(DEFAULT_CONFIG);
      setIsDirty(true);
    }
  };

  const updateConfig = (key: keyof RIConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={`p-4 rounded-lg border ${config.enabled ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"}`}>
        <div className="flex items-center gap-2">
          <AlertCircle size={20} className={config.enabled ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"} />
          <div>
            <div className="font-semibold text-foreground">
              Route Intelligence is {config.enabled ? "Enabled" : "Disabled"}
            </div>
            <div className="text-sm text-muted-foreground">
              {config.enabled
                ? "Voice search uses Route Intelligence with learned mappings"
                : "Voice search uses legacy fuzzy matching"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enable/Disable */}
        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => updateConfig("enabled", e.target.checked)}
              className="w-5 h-5 rounded border-border"
            />
            <div>
              <div className="font-semibold text-foreground">Enable Route Intelligence</div>
              <div className="text-sm text-muted-foreground">Use advanced search engine for voice queries</div>
            </div>
          </label>
        </div>

        {/* Alias Matching */}
        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableAliasMatching}
              onChange={e => updateConfig("enableAliasMatching", e.target.checked)}
              className="w-5 h-5 rounded border-border"
            />
            <div>
              <div className="font-semibold text-foreground">Enable Alias Matching</div>
              <div className="text-sm text-muted-foreground">Match against resident aliases and nicknames</div>
            </div>
          </label>
        </div>

        {/* Broad Fallback */}
        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enableBroadFallback}
              onChange={e => updateConfig("enableBroadFallback", e.target.checked)}
              className="w-5 h-5 rounded border-border"
            />
            <div>
              <div className="font-semibold text-foreground">Enable Broad Fallback</div>
              <div className="text-sm text-muted-foreground">Use fuzzy matching when exact match fails</div>
            </div>
          </label>
        </div>
      </div>

      {/* Threshold Settings */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Thresholds & Limits</h3>

        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="block text-sm font-semibold text-foreground mb-3">
            Fuzzy Matching Threshold
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.fuzzyMatchingThreshold}
              onChange={e => updateConfig("fuzzyMatchingThreshold", parseFloat(e.target.value))}
              className="flex-1"
            />
            <div className="text-sm font-mono text-foreground w-12">
              {(config.fuzzyMatchingThreshold * 100).toFixed(0)}%
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Minimum similarity score for fuzzy matching results (0.6 = 60% match required)
          </p>
        </div>

        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="block text-sm font-semibold text-foreground mb-3">
            Learned Mapping Confidence Threshold
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.learnedMappingConfidenceThreshold}
              onChange={e =>
                updateConfig("learnedMappingConfidenceThreshold", parseFloat(e.target.value))
              }
              className="flex-1"
            />
            <div className="text-sm font-mono text-foreground w-12">
              {(config.learnedMappingConfidenceThreshold * 100).toFixed(0)}%
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Minimum confidence to use learned mappings (0.5 = 50% confidence required)
          </p>
        </div>

        <div className="p-6 bg-card rounded-lg border border-border">
          <label className="block text-sm font-semibold text-foreground mb-3">
            Maximum Fuzzy Results
          </label>
          <input
            type="number"
            min="1"
            max="20"
            value={config.maxFuzzyResults}
            onChange={e => updateConfig("maxFuzzyResults", parseInt(e.target.value))}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Maximum number of fuzzy matching results to display (1-20)
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          {isSaving ? "Saving..." : "Save Configuration"}
        </button>

        <button
          onClick={handleReset}
          className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
        >
          Reset to Defaults
        </button>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950 dark:border-blue-800">
        <div className="text-sm text-foreground">
          <strong>Note:</strong> Configuration changes are saved locally in your browser. Changes will
          apply to all future voice searches on this device.
        </div>
      </div>
    </div>
  );
}
