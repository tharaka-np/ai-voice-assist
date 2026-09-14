import { describe, expect, it } from "vitest";

import {
  extractDeepgramErrorMessage,
  extractDeepgramTranscript,
} from "@/lib/deepgram/response";
import {
  TRANSCRIPTION_PROVIDER_IDS,
  TRANSCRIPTION_PROVIDER_META,
  isTranscriptionProviderId,
} from "@/lib/transcription/types";

describe("isTranscriptionProviderId", () => {
  it.each([
    ["openai", true],
    ["deepgram", true],
    ["Deepgram", false],
    ["whisper", false],
    ["", false],
    [null, false],
    [undefined, false],
    [42, false],
  ] as const)("treats %s as %s", (value, expected) => {
    expect(isTranscriptionProviderId(value)).toBe(expected);
  });
});

describe("provider registry metadata", () => {
  it("has display metadata for every registered id", () => {
    for (const id of TRANSCRIPTION_PROVIDER_IDS) {
      const meta = TRANSCRIPTION_PROVIDER_META[id];

      expect(meta.label.length, `${id} needs a label`).toBeGreaterThan(0);
      expect(meta.description.length, `${id} needs a description`).toBeGreaterThan(0);
    }
  });
});

/**
 * The Deepgram adapter cannot be exercised without a key, so the response
 * envelope it depends on is parsed by a pure function and tested directly.
 */
describe("extractDeepgramTranscript", () => {
  it("reads the first alternative of the first channel", () => {
    const payload = {
      metadata: { channels: 1 },
      results: {
        channels: [
          {
            alternatives: [
              { transcript: "My name is Tharaka.", confidence: 0.99 },
              { transcript: "My name is Taraka.", confidence: 0.71 },
            ],
          },
        ],
      },
    };

    expect(extractDeepgramTranscript(payload)).toBe("My name is Tharaka.");
  });

  it("returns an empty string when Deepgram heard nothing", () => {
    const payload = {
      results: { channels: [{ alternatives: [{ transcript: "" }] }] },
    };

    expect(extractDeepgramTranscript(payload)).toBe("");
  });

  it.each([
    ["null", null],
    ["a bare string", "nope"],
    ["an empty object", {}],
    ["results without channels", { results: {} }],
    ["an empty channel list", { results: { channels: [] } }],
    ["a channel without alternatives", { results: { channels: [{}] } }],
    ["an empty alternative list", { results: { channels: [{ alternatives: [] }] } }],
    [
      "an alternative without a transcript",
      { results: { channels: [{ alternatives: [{ confidence: 0.9 }] }] } },
    ],
    [
      "a non-string transcript",
      { results: { channels: [{ alternatives: [{ transcript: 12 }] }] } },
    ],
  ])("returns null for %s", (_label, payload) => {
    expect(extractDeepgramTranscript(payload)).toBe(null);
  });
});

describe("extractDeepgramErrorMessage", () => {
  it.each([
    [{ err_msg: "Bad Request" }, "Bad Request"],
    [{ message: "Unauthorized" }, "Unauthorized"],
    [{ reason: "quota exceeded" }, "quota exceeded"],
    [{ err_msg: "  padded  " }, "padded"],
  ])("pulls a message out of %o", (payload, expected) => {
    expect(extractDeepgramErrorMessage(payload)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["a blank message", { err_msg: "   " }],
    ["a non-string message", { message: 500 }],
  ])("returns null for %s", (_label, payload) => {
    expect(extractDeepgramErrorMessage(payload)).toBe(null);
  });
});
