import { describe, expect, it } from "vitest";

import { MIN_AUDIO_BYTES, isAcceptedAudioMimeType } from "@/lib/audio/formats";
import {
  readSelectedContactId,
  validateProcessAudioForm,
} from "@/lib/audio/validation";
import { AppError, type AppErrorCode } from "@/lib/errors";

const VALID_TIMEZONE = "Asia/Colombo";
const VALID_DATE_TIME = "2026-09-09T17:20:00+05:30";

function audioFile({
  bytes = 4096,
  type = "audio/webm",
  name = "recording.webm",
} = {}): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function buildForm(
  overrides: {
    audio?: File | null;
    timezone?: string | null;
    currentDateTime?: string | null;
    provider?: string | null;
  } = {},
): FormData {
  const form = new FormData();
  const {
    audio = audioFile(),
    timezone = VALID_TIMEZONE,
    currentDateTime = VALID_DATE_TIME,
    provider = null,
  } = overrides;

  if (audio !== null) form.append("audio", audio, audio.name);
  if (timezone !== null) form.append("timezone", timezone);
  if (currentDateTime !== null) form.append("currentDateTime", currentDateTime);
  if (provider !== null) form.append("provider", provider);

  return form;
}

function expectRejection(form: FormData, code: AppErrorCode): void {
  try {
    validateProcessAudioForm(form);
    throw new Error(`expected validation to fail with '${code}'`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("validateProcessAudioForm", () => {
  it("accepts a well-formed request", () => {
    const result = validateProcessAudioForm(buildForm());

    expect(result.timezone).toBe(VALID_TIMEZONE);
    expect(result.currentDateTime).toBe(VALID_DATE_TIME);
    expect(result.audio.type).toBe("audio/webm");
  });

  it("rejects a request with no audio", () => {
    expectRejection(buildForm({ audio: null }), "audio_missing");
  });

  it("rejects audio that is too small to contain speech", () => {
    expectRejection(
      buildForm({ audio: audioFile({ bytes: MIN_AUDIO_BYTES - 1 }) }),
      "audio_empty",
    );
  });

  it("rejects an unsupported container", () => {
    expectRejection(
      buildForm({
        audio: audioFile({ type: "video/mp4", name: "clip.mp4" }),
      }),
      "audio_unsupported_type",
    );
  });

  it("rejects a missing timezone rather than guessing one", () => {
    expectRejection(buildForm({ timezone: null }), "invalid_metadata");
  });

  it("rejects an unknown IANA timezone", () => {
    expectRejection(
      buildForm({ timezone: "Mars/Olympus_Mons" }),
      "invalid_metadata",
    );
  });

  it("rejects a missing timestamp", () => {
    expectRejection(buildForm({ currentDateTime: null }), "invalid_metadata");
  });

  it("rejects an unparseable timestamp", () => {
    expectRejection(
      buildForm({ currentDateTime: "yesterday afternoon" }),
      "invalid_metadata",
    );
  });

  describe("transcription provider", () => {
    it("defaults to null when the field is absent, letting the server decide", () => {
      expect(validateProcessAudioForm(buildForm()).providerId).toBe(null);
    });

    it("treats an empty value as absent", () => {
      expect(validateProcessAudioForm(buildForm({ provider: "" })).providerId).toBe(
        null,
      );
    });

    it.each(["openai", "deepgram"] as const)("accepts %s", (provider) => {
      expect(
        validateProcessAudioForm(buildForm({ provider })).providerId,
      ).toBe(provider);
    });

    it.each(["whisper", "OpenAI", "deepgram ", "gpt-4o"])(
      "rejects the unrecognised provider %s rather than falling back",
      (provider) => {
        expectRejection(buildForm({ provider }), "invalid_metadata");
      },
    );
  });
});

describe("isAcceptedAudioMimeType", () => {
  it.each([
    ["audio/webm", true],
    ["audio/webm;codecs=opus", true],
    ["AUDIO/WEBM", true],
    ["audio/mp4", true],
    ["audio/mp4;codecs=mp4a.40.2", true],
    ["audio/mpeg", true],
    ["audio/wav", true],
    ["video/mp4", false],
    ["application/octet-stream", false],
    ["", false],
  ] as const)("treats %s as %s", (mimeType, expected) => {
    expect(isAcceptedAudioMimeType(mimeType)).toBe(expected);
  });
});

describe("readSelectedContactId", () => {
  function form(value: string | null): FormData {
    const data = new FormData();
    if (value !== null) data.append("selectedContactId", value);
    return data;
  }

  it("reads a selection carried from an earlier turn", () => {
    expect(readSelectedContactId(form("103"))).toBe(103);
  });

  it("treats an absent field as nothing selected", () => {
    expect(readSelectedContactId(form(null))).toBeNull();
  });

  it("treats an empty field as nothing selected", () => {
    // How the client omits a cleared selection.
    expect(readSelectedContactId(form(""))).toBeNull();
  });

  it.each(["abc", "0", "-4", "1.5", "NaN"])(
    "rejects %s rather than silently dropping the selection",
    (value) => {
      // Defaulting to null here would lose the user's pick, which is the exact
      // failure this field exists to prevent. Fail loudly instead.
      expect(() => readSelectedContactId(form(value))).toThrow(AppError);
    },
  );
});
