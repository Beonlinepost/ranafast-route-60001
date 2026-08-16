import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X, Save, Dog, ChevronDown, Plus } from "lucide-react";
import type { Stop } from "../../../drizzle/schema";
import { splitPipe } from "@/lib/matching";

interface EditStopModalProps {
  stop: Stop;
  sectionName: string;
  boxNumber: number;
  onClose: () => void;
  onSaved: (updated: Stop) => void;
  isNew?: boolean;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
const textareaCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none";

/** Alias chip tag list — the core operational alias editor */
function AliasTags({
  aliases,
  onChange,
}: {
  aliases: string[];
  onChange: (aliases: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addAlias = () => {
    const val = inputValue.trim();
    if (!val) return;
    // Avoid duplicates (case-insensitive)
    if (aliases.some(a => a.toLowerCase() === val.toLowerCase())) {
      setInputValue("");
      return;
    }
    onChange([...aliases, val]);
    setInputValue("");
    inputRef.current?.focus();
  };

  const removeAlias = (idx: number) => {
    onChange(aliases.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "|") {
      e.preventDefault();
      addAlias();
    }
    if (e.key === "Backspace" && !inputValue && aliases.length > 0) {
      removeAlias(aliases.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      {/* Existing alias chips */}
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((alias, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20"
            >
              {alias}
              <button
                type="button"
                onClick={() => removeAlias(idx)}
                className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                aria-label={`Remove alias ${alias}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add new alias */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={aliases.length === 0 ? "e.g. MacCullagh, McCullah, Macula…" : "Add another alias…"}
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          onClick={addAlias}
          disabled={!inputValue.trim()}
          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      <p className="text-xs text-muted-foreground/70">
        Press <kbd className="font-mono bg-muted px-1 rounded">Enter</kbd> or <kbd className="font-mono bg-muted px-1 rounded">,</kbd> to add. Tap a chip to remove.
        Aliases are speech-recovery intelligence — add any pronunciation variant, OCR misfire, or surname spelling the system might hear.
      </p>
    </div>
  );
}

export default function EditStopModal({
  stop,
  sectionName,
  boxNumber,
  onClose,
  onSaved,
}: EditStopModalProps) {
  const [side, setSide] = useState(stop.side ?? "");
  const [businessName, setBusinessName] = useState(stop.businessName ?? "");
  const [residents, setResidents] = useState(stop.residents ?? "");
  const [aliases, setAliases] = useState<string[]>(splitPipe(stop.aliases));
  const [notes, setNotes] = useState(stop.notes ?? "");
  const [safePlace, setSafePlace] = useState(stop.safePlace ?? "");
  const [propertyType, setPropertyType] = useState(stop.propertyType ?? "");
  const [hasDog, setHasDog] = useState(stop.hasDog ?? false);
  const [houseName, setHouseName] = useState(stop.houseName ?? "");
  const [houseNumber, setHouseNumber] = useState(stop.houseNumber ?? "");
  const [road, setRoad] = useState(stop.road ?? "");
  const [eircode, setEircode] = useState(stop.eircode ?? "");

  const utils = trpc.useUtils();

  const updateMutation = trpc.stops.update.useMutation({
    onSuccess: (updated) => {
      if (updated) {
        toast.success("Stop saved");
        utils.stops.listBySection.invalidate({ sectionId: stop.sectionId });
        utils.stops.listAll.invalidate();
        onSaved(updated as Stop);
      }
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const handleSave = () => {
    // Strip aliases that are just a bare surname already present in the residents list.
    // These pollute the alias field and cause false broad-match results.
    const residentNames = residents.split("|").map(r => r.trim()).filter(Boolean);
    const residentSurnames = new Set(
      residentNames.flatMap(r => {
        const parts = r.split(/\s+/);
        return parts.length >= 2 ? [parts[parts.length - 1]!.toLowerCase()] : [];
      })
    );
    const cleanedAliases = aliases.filter(alias => {
      const tokens = alias.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 1) {
        return !residentSurnames.has(tokens[0]!.toLowerCase());
      }
      return true;
    });

    updateMutation.mutate({
      id: stop.id,
      businessName: businessName || null,
      side: side || null,
      residents: residents || null,
      // Store aliases pipe-separated internally (surname-only aliases stripped)
      aliases: cleanedAliases.length > 0 ? cleanedAliases.join(" | ") : null,
      notes: notes || null,
      safePlace: safePlace || null,
      propertyType: propertyType || null,
      hasDog,
      houseName: houseName || null,
      houseNumber: houseNumber || null,
      road: road || null,
      eircode: eircode || null,
    });
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet — slides up from bottom */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl max-h-[92dvh] flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">
              Box {boxNumber} · {sectionName} · Stop #{stop.stopOrder}
            </p>
            <h2
              className="text-base font-bold text-foreground leading-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Edit Stop
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable fields ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Side */}
          <Field label="Side">
            <div className="relative">
              <select
                value={side}
                onChange={e => setSide(e.target.value)}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="">— not set —</option>
                <option value="Left">Left</option>
                <option value="Right">Right</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </Field>

          {/* Property type */}
          <Field label="Property Type">
            <div className="relative">
              <select
                value={propertyType}
                onChange={e => setPropertyType(e.target.value)}
                className={`${inputCls} appearance-none pr-8`}
              >
                <option value="">— not set —</option>
                <option value="Residential">Residential</option>
                <option value="Business">Business</option>
                <option value="Holiday House">Holiday House</option>
                <option value="Vacant">Vacant</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </Field>

          {/* Business Name — shown only for Business stops */}
          {propertyType === "Business" && (
            <Field
              label="Business Name"
              hint="Primary callback target — spoken first in voice callback"
            >
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Kelly's Pharmacy, McGinley's Garage"
                className={inputCls}
              />
            </Field>
          )}

          {/* Residents */}
          <Field
            label="Residents (pipe-separated)"
            hint="Separate multiple residents with | — displayed with commas on cards"
          >
            <textarea
              value={residents}
              onChange={e => setResidents(e.target.value)}
              rows={3}
              placeholder="James McCullagh | Anne McCullagh"
              className={textareaCls}
            />
          </Field>

          {/* ── ALIASES — operational speech-recovery intelligence ── */}
          <Field
            label="Aliases — Speech Recovery"
          >
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-3 pt-3 pb-2 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Pronunciation variants · OCR misfires · Surname alternatives
              </p>
              <AliasTags aliases={aliases} onChange={setAliases} />
            </div>
          </Field>

          {/* ── Address hierarchy ── */}
          <Field label="Address / House Name">
            <input
              type="text"
              value={houseName}
              onChange={e => setHouseName(e.target.value)}
              placeholder="e.g. Seaview, The Old Forge, Tigh Mháire"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="House Number">
              <input
                type="text"
                value={houseNumber}
                onChange={e => setHouseNumber(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Eircode">
              <input
                type="text"
                value={eircode}
                onChange={e => setEircode(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Route Reference">
            <input
              type="text"
              value={road}
              onChange={e => setRoad(e.target.value)}
              className={inputCls}
            />
          </Field>

          {/* Parcel Drop-Off */}
          <Field label="Parcel Drop-Off">
            <input
              type="text"
              value={safePlace}
              onChange={e => setSafePlace(e.target.value)}
              placeholder="e.g. Porch, Shed, Side Gate, Neighbour at No. 4"
              className={inputCls}
            />
          </Field>

          {/* Notes */}
          <Field label="Delivery Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Red door. Long lane. Two white pillars."
              className={textareaCls}
            />
          </Field>

          {/* Dog Warning */}
          <Field label="Alerts">
            <button
              type="button"
              onClick={() => setHasDog(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold uppercase tracking-wide transition-colors ${
                hasDog
                  ? "bg-red-50 border-red-400 text-red-700"
                  : "bg-background border-border text-muted-foreground"
              }`}
            >
              <Dog size={16} />
              Dog Warning
              <span
                className={`ml-auto w-4 h-4 rounded-full border-2 ${
                  hasDog ? "bg-red-500 border-red-500" : "border-muted-foreground"
                }`}
              />
            </button>
          </Field>
        </div>

        {/* ── Save button ── */}
        <div className="px-4 py-3 border-t border-border shrink-0 bg-background">
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 rounded-xl shadow hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save size={16} />
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
