import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { matchStops } from '@/lib/matching';
import type { Stop } from '../../../drizzle/schema';

export interface SaveNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transcript: string, stopId: number, stopName: string) => Promise<void>;
  voiceTranscript: string;
  stops: Stop[];
}

export function SaveNameModal({
  isOpen,
  onClose,
  onSave,
  voiceTranscript,
  stops,
}: SaveNameModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState(voiceTranscript);

  // Get top 5 fuzzy matches
  const topMatches = useMemo(() => {
    const result = matchStops(stops, voiceTranscript);
    return result.results.slice(0, 5); // Top 5 matches
  }, [voiceTranscript, stops]);

  const handleSelectStop = async (stop: Stop) => {
    setIsLoading(true);
    setError(null);

    try {
      const stopName = stop.residents || `Stop ${stop.stopOrder}`;
      await onSave(voiceTranscript, stop.id, stopName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
      setIsLoading(false);
    }
  };

  const handleSaveManualName = async () => {
    if (!manualName.trim()) {
      setError('Please enter a name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // For manual names with no match, use a placeholder stopId (0)
      // The system will still learn the mapping
      await onSave(voiceTranscript, 0, manualName.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && manualName.trim()) {
      handleSaveManualName();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Is this correct?</DialogTitle>
          <DialogDescription>
            You said: <span className="font-semibold text-foreground">"{voiceTranscript}"</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Show tap buttons if matches exist */}
          {topMatches.length > 0 ? (
            <>
              {topMatches.map((stop) => (
                <button
                  key={stop.id}
                  onClick={() => handleSelectStop(stop)}
                  disabled={isLoading}
                  className="w-full p-4 text-left border-2 border-border rounded-lg hover:bg-accent hover:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="font-semibold text-base">{stop.residents || `Stop ${stop.stopOrder}`}</div>
                  <div className="text-sm text-muted-foreground">Box {stop.stopOrder}</div>
                </button>
              ))}

              {/* Fallback to manual entry */}
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-2">Not in the list? Type the correct name:</p>
                <Input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter the correct name"
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            // Show text input if no matches found
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No matching stops found. Type the correct name:</p>
              <Input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter the correct name"
                autoFocus
                disabled={isLoading}
              />
            </div>
          )}

          {/* Error message */}
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            {topMatches.length === 0 && (
              <Button
                onClick={handleSaveManualName}
                disabled={isLoading || !manualName.trim()}
              >
                {isLoading ? 'Saving...' : 'Save Name'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
