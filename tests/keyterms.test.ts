import { afterEach, describe, expect, it, vi } from "vitest";

import { buildListenUrl } from "@/lib/deepgram/request";
import {
  DEMO_KEYTERMS,
  KEYTERM_MAX_COUNT,
  KEYTERM_TOKEN_BUDGET,
  estimateKeytermTokens,
  getConfiguredKeyterms,
  parseKeytermList,
  prepareKeyterms,
  sanitizeKeyterm,
} from "@/lib/transcription/vocabulary";

const LISTEN_URL = "https://api.deepgram.com/v1/listen";

describe("sanitizeKeyterm", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeKeyterm("  Amanda   Wilson  ")).toBe("Amanda Wilson");
  });

  it("preserves capitalisation, which Deepgram uses to shape the output", () => {
    expect(sanitizeKeyterm("Tharaka Pathirana")).toBe("Tharaka Pathirana");
  });

  it.each([
    ["Wilson, Amanda", "Wilson Amanda"],
    ["Wilson; Amanda", "Wilson Amanda"],
    ["Amanda Wilson:0.15", "Amanda Wilson 0.15"],
  ])(
    "strips %s, which Deepgram would otherwise accept and silently ignore",
    (input, expected) => {
      expect(sanitizeKeyterm(input)).toBe(expected);
    },
  );

  it("reduces a separator-only value to an empty string", () => {
    expect(sanitizeKeyterm(" , ; : ")).toBe("");
  });
});

describe("estimateKeytermTokens", () => {
  it("costs at least one token per word", () => {
    expect(estimateKeytermTokens("Jo Li")).toBe(2);
  });

  it("charges more for longer, less common names", () => {
    const common = estimateKeytermTokens("John Doe");
    const uncommon = estimateKeytermTokens("Tharaka Pathirana");

    expect(uncommon).toBeGreaterThan(common);
  });

  it("returns zero for an empty term", () => {
    expect(estimateKeytermTokens("")).toBe(0);
  });

  it("keeps the demo vocabulary well inside the budget", () => {
    const total = DEMO_KEYTERMS.reduce(
      (sum, term) => sum + estimateKeytermTokens(term),
      0,
    );

    expect(total).toBeLessThan(KEYTERM_TOKEN_BUDGET);
  });
});

describe("parseKeytermList", () => {
  it("splits an operator-supplied comma list", () => {
    expect(parseKeytermList("Amanda Wilson, Tharaka Pathirana")).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });

  it("splits on newlines too", () => {
    expect(parseKeytermList("Amanda Wilson\nTharaka Pathirana")).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });

  it("drops blank entries from trailing or doubled separators", () => {
    expect(parseKeytermList("Amanda Wilson,,  ,")).toEqual(["Amanda Wilson"]);
  });

  it("returns an empty list when unset", () => {
    expect(parseKeytermList(undefined)).toEqual([]);
    expect(parseKeytermList("")).toEqual([]);
  });
});

describe("prepareKeyterms", () => {
  it("passes the demo vocabulary through unchanged", () => {
    expect(prepareKeyterms(DEMO_KEYTERMS)).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });

  it("de-duplicates case-insensitively but keeps the first casing", () => {
    expect(
      prepareKeyterms(["Amanda Wilson", "amanda wilson", "AMANDA WILSON"]),
    ).toEqual(["Amanda Wilson"]);
  });

  it("removes entries that sanitise away to nothing", () => {
    expect(prepareKeyterms(["", "   ", ",;:", "Amanda Wilson"])).toEqual([
      "Amanda Wilson",
    ]);
  });

  it("caps the list at the documented maximum", () => {
    const many = Array.from({ length: 150 }, (_, index) => `Name${index}`);

    expect(prepareKeyterms(many)).toHaveLength(KEYTERM_MAX_COUNT);
  });

  it("stops at the token budget", () => {
    // Each term is deliberately expensive, so the budget binds before the count.
    const expensive = Array.from(
      { length: 100 },
      (_, index) => `Aaaaaaaaaaaaaaaaaaaa${index} Bbbbbbbbbbbbbbbbbbbb${index}`,
    );

    const prepared = prepareKeyterms(expensive);
    const spent = prepared.reduce(
      (sum, term) => sum + estimateKeytermTokens(term),
      0,
    );

    expect(prepared.length).toBeLessThan(expensive.length);
    expect(spent).toBeLessThanOrEqual(KEYTERM_TOKEN_BUDGET);
  });

  it("treats input order as priority order", () => {
    const [first] = prepareKeyterms(["Tharaka Pathirana", "Amanda Wilson"]);

    expect(first).toBe("Tharaka Pathirana");
  });

  it("returns an empty list for empty input", () => {
    expect(prepareKeyterms([])).toEqual([]);
  });
});

describe("getConfiguredKeyterms", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the demo vocabulary when unset", () => {
    vi.stubEnv("TRANSCRIPTION_KEYTERMS", undefined);

    expect(getConfiguredKeyterms()).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });

  it("uses a configured list when present", () => {
    vi.stubEnv("TRANSCRIPTION_KEYTERMS", "Eric Poe, ScriptTrainer");

    expect(getConfiguredKeyterms()).toEqual(["Eric Poe", "ScriptTrainer"]);
  });

  it("falls back when the configured list is only separators", () => {
    vi.stubEnv("TRANSCRIPTION_KEYTERMS", " , , ");

    expect(getConfiguredKeyterms()).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });
});

describe("buildListenUrl", () => {
  it("sets the model and smart formatting", () => {
    const url = buildListenUrl({ baseUrl: LISTEN_URL, model: "nova-3" });

    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("smart_format")).toBe("true");
  });

  it("repeats the keyterm parameter once per term", () => {
    const url = buildListenUrl({
      baseUrl: LISTEN_URL,
      model: "nova-3",
      keyterms: ["Amanda Wilson", "Tharaka Pathirana"],
    });

    expect(url.searchParams.getAll("keyterm")).toEqual([
      "Amanda Wilson",
      "Tharaka Pathirana",
    ]);
  });

  it("encodes a multi-word name as a single term", () => {
    const url = buildListenUrl({
      baseUrl: LISTEN_URL,
      model: "nova-3",
      keyterms: ["Amanda Wilson"],
    });

    expect(url.search).toContain("keyterm=Amanda+Wilson");
  });

  it("never comma-joins terms, which Deepgram accepts but silently ignores", () => {
    const url = buildListenUrl({
      baseUrl: LISTEN_URL,
      model: "nova-3",
      keyterms: ["Amanda Wilson", "Tharaka Pathirana"],
    });

    expect(url.search).not.toContain("%2C");
    expect(url.search).not.toContain(",");
  });

  it("omits the parameter entirely when there are no terms", () => {
    const url = buildListenUrl({ baseUrl: LISTEN_URL, model: "nova-3" });

    expect(url.searchParams.has("keyterm")).toBe(false);
  });

  it("produces the full expected query for the demo vocabulary", () => {
    const url = buildListenUrl({
      baseUrl: LISTEN_URL,
      model: "nova-3",
      keyterms: prepareKeyterms(DEMO_KEYTERMS),
    });

    expect(url.toString()).toBe(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true" +
        "&keyterm=Amanda+Wilson&keyterm=Tharaka+Pathirana",
    );
  });
});
