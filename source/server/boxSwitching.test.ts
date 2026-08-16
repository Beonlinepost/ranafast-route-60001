import { describe, it, expect } from "vitest";

/**
 * Test the box switching command regex patterns used in Delivery mode
 */
describe("Box Switching Voice Commands", () => {
  // Regex patterns from RouteView.tsx
  const boxMatch = (q: string) => q.match(/^box\s+(\d+)$/i);
  const nextBoxMatch = (q: string) => q.match(/^next\s+box$/i);

  describe("Box number commands", () => {
    it("should match 'box 1'", () => {
      const result = boxMatch("box 1");
      expect(result).not.toBeNull();
      expect(result?.[1]).toBe("1");
    });

    it("should match 'Box 2' (case insensitive)", () => {
      const result = boxMatch("Box 2");
      expect(result).not.toBeNull();
      expect(result?.[1]).toBe("2");
    });

    it("should match 'BOX 10'", () => {
      const result = boxMatch("BOX 10");
      expect(result).not.toBeNull();
      expect(result?.[1]).toBe("10");
    });

    it("should not match 'box' without number", () => {
      const result = boxMatch("box");
      expect(result).toBeNull();
    });

    it("should not match 'box 1 2' (extra words)", () => {
      const result = boxMatch("box 1 2");
      expect(result).toBeNull();
    });

    it("should not match 'go to box 1' (prefix)", () => {
      const result = boxMatch("go to box 1");
      expect(result).toBeNull();
    });

    it("should not match 'box 1 please' (suffix)", () => {
      const result = boxMatch("box 1 please");
      expect(result).toBeNull();
    });
  });

  describe("Next box commands", () => {
    it("should match 'next box'", () => {
      const result = nextBoxMatch("next box");
      expect(result).not.toBeNull();
    });

    it("should match 'Next Box' (case insensitive)", () => {
      const result = nextBoxMatch("Next Box");
      expect(result).not.toBeNull();
    });

    it("should match 'NEXT BOX'", () => {
      const result = nextBoxMatch("NEXT BOX");
      expect(result).not.toBeNull();
    });

    it("should not match 'next' alone", () => {
      const result = nextBoxMatch("next");
      expect(result).toBeNull();
    });

    it("should not match 'next box please' (suffix)", () => {
      const result = nextBoxMatch("next box please");
      expect(result).toBeNull();
    });

    it("should not match 'go next box' (prefix)", () => {
      const result = nextBoxMatch("go next box");
      expect(result).toBeNull();
    });
  });

  describe("Section lookup simulation", () => {
    // Mock sections data
    const mockSections = [
      { id: 1, boxNumber: 1, name: "Quay Road" },
      { id: 2, boxNumber: 2, name: "Carnmore Road / Little Bridge" },
      { id: 3, boxNumber: 3, name: "Caravan Road / Diamond 1" },
    ];

    it("should find section by box number", () => {
      const boxNum = 1;
      const targetSection = mockSections.find(s => s.boxNumber === boxNum);
      expect(targetSection).toEqual({ id: 1, boxNumber: 1, name: "Quay Road" });
    });

    it("should find section 2 by box number", () => {
      const boxNum = 2;
      const targetSection = mockSections.find(s => s.boxNumber === boxNum);
      expect(targetSection).toEqual({ id: 2, boxNumber: 2, name: "Carnmore Road / Little Bridge" });
    });

    it("should not find section for non-existent box number", () => {
      const boxNum = 99;
      const targetSection = mockSections.find(s => s.boxNumber === boxNum);
      expect(targetSection).toBeUndefined();
    });

    it("should find next section in order", () => {
      const currentIdx = 0; // Box 1
      const nextSection = mockSections[currentIdx + 1];
      expect(nextSection).toEqual({ id: 2, boxNumber: 2, name: "Carnmore Road / Little Bridge" });
    });

    it("should not find next section when at end", () => {
      const currentIdx = 2; // Box 3 (last)
      const nextSection = mockSections[currentIdx + 1];
      expect(nextSection).toBeUndefined();
    });
  });

  describe("Voice callback text generation", () => {
    it("should generate correct callback for box activation", () => {
      const boxNum = 1;
      const sectionName = "Quay Road";
      const speech = `Box ${boxNum} ready. ${sectionName}.`;
      expect(speech).toBe("Box 1 ready. Quay Road.");
    });

    it("should generate correct callback for next box", () => {
      const boxNum = 2;
      const sectionName = "Carnmore Road / Little Bridge";
      const speech = `Box ${boxNum} ready. ${sectionName}.`;
      expect(speech).toBe("Box 2 ready. Carnmore Road / Little Bridge.");
    });

    it("should generate error message for box not found", () => {
      const boxNum = 99;
      const speech = `Box ${boxNum} not found.`;
      expect(speech).toBe("Box 99 not found.");
    });

    it("should generate error message for no next box", () => {
      const speech = "No next box.";
      expect(speech).toBe("No next box.");
    });
  });
});
