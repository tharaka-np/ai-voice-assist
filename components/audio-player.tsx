"use client";

/**
 * Playback for the current clip.
 *
 * Consumers must pass `key={src}` so a new recording remounts the element.
 * Swapping the `src` attribute alone leaves some browsers holding the previous
 * buffer until `load()` is called manually.
 */
export function AudioPlayer({
  src,
  label = "Recorded audio",
}: {
  src: string;
  label?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
      <audio
        controls
        preload="metadata"
        src={src}
        aria-label={label}
        className="w-full"
      >
        Your browser can&apos;t play audio inline. Download the recording to
        listen to it.
      </audio>
    </div>
  );
}
