import { describe, expect, it } from "vitest";
import { csvCell, fileSlug, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Anita Shetty")).toBe("Anita Shetty");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-50)).toBe("-50"); // a refund is a number, not a formula
    expect(csvCell(true)).toBe("true");
  });

  it("is empty for nothing", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("Rao, Meera")).toBe('"Rao, Meera"');
    expect(csvCell('The "Mysore" Blues')).toBe('"The ""Mysore"" Blues"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
    expect(csvCell("+91 98450 11223")).toBe("'+91 98450 11223");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
  });

  it("keeps Kannada and accented names as they are", () => {
    expect(csvCell("ಅನಿತಾ ಶೆಟ್ಟಿ")).toBe("ಅನಿತಾ ಶೆಟ್ಟಿ");
    expect(csvCell("José Müller")).toBe("José Müller");
  });
});

describe("toCsv", () => {
  it("writes one CRLF-terminated line per row", () => {
    expect(toCsv([["Name", "Qty"], ["Anita", 2]])).toBe("Name,Qty\r\nAnita,2\r\n");
  });
});

describe("fileSlug", () => {
  it("makes a safe file name", () => {
    expect(fileSlug("Friday Raga — Gokulam Hall!")).toBe("friday-raga-gokulam-hall");
    expect(fileSlug("  ../../etc/passwd ")).toBe("etcpasswd");
    expect(fileSlug("ಕನ್ನಡ")).toBe("export");
    expect(fileSlug("", "guest-list")).toBe("guest-list");
  });
});
