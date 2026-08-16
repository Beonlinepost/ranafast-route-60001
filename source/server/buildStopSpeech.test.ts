import { describe, it, expect } from "vitest";
import type { Stop } from "../drizzle/schema";

/**
 * Test the buildStopSpeech callback text generation for each mode.
 * This mirrors the logic in RouteView.tsx but as a pure function for testing.
 */
function buildStopSpeech(
  stop: Stop,
  spokenName: string,
  mode: "sorting" | "delivery" | "parcel"
): string {
  const parts: string[] = [];

  if (mode === "sorting") {
    // SORTING MODE: name + route reference only
    if (spokenName) parts.push(spokenName);
    if (stop.road) parts.push(stop.road);
  } else if (mode === "delivery") {
    // DELIVERY MODE: stop number only
    parts.push(`Stop ${stop.stopOrder}`);
  } else if (mode === "parcel") {
    // PARCEL MODE: name + route reference + stop number
    if (spokenName) parts.push(spokenName);
    if (stop.road) parts.push(stop.road);
    parts.push(`Stop ${stop.stopOrder}`);
  }

  return parts.join(". ");
}

describe("buildStopSpeech", () => {
  const mockStop: Stop = {
    id: 1,
    sectionId: 1,
    routeId: 1,
    stopOrder: 5,
    propertyType: "Residential",
    side: "L",
    road: "Quay Road",
    houseName: "Pond Villa",
    businessName: null,
    houseNumber: null,
    eircode: "F94 T9C9",
    residents: ["Owenie Gallagher"],
    aliases: ["onie", "ownie", "onenie"],
    searchTags: [],
    hasDog: false,
    safePlace: null,
    notes: "Brown pebbledash",
    lat: null,
    lng: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("SORTING mode: should say name + route reference only", () => {
    const speech = buildStopSpeech(mockStop, "Owenie Gallagher", "sorting");
    expect(speech).toBe("Owenie Gallagher. Quay Road");
  });

  it("SORTING mode: should handle missing name gracefully", () => {
    const speech = buildStopSpeech(mockStop, "", "sorting");
    expect(speech).toBe("Quay Road");
  });

  it("DELIVERY mode: should say stop number only", () => {
    const speech = buildStopSpeech(mockStop, "Owenie Gallagher", "delivery");
    expect(speech).toBe("Stop 5");
  });

  it("DELIVERY mode: should ignore name and route reference", () => {
    const speech = buildStopSpeech(mockStop, "", "delivery");
    expect(speech).toBe("Stop 5");
  });

  it("PARCEL mode: should say name + route reference + stop number", () => {
    const speech = buildStopSpeech(mockStop, "Owenie Gallagher", "parcel");
    expect(speech).toBe("Owenie Gallagher. Quay Road. Stop 5");
  });

  it("PARCEL mode: should handle missing name", () => {
    const speech = buildStopSpeech(mockStop, "", "parcel");
    expect(speech).toBe("Quay Road. Stop 5");
  });

  it("PARCEL mode: should handle missing road", () => {
    const stopNoRoad = { ...mockStop, road: null };
    const speech = buildStopSpeech(stopNoRoad, "Owenie Gallagher", "parcel");
    expect(speech).toBe("Owenie Gallagher. Stop 5");
  });

  it("SORTING mode: should handle missing road", () => {
    const stopNoRoad = { ...mockStop, road: null };
    const speech = buildStopSpeech(stopNoRoad, "Owenie Gallagher", "sorting");
    expect(speech).toBe("Owenie Gallagher");
  });
});
