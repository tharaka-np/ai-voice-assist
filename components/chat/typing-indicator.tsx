import { MessageRow } from "@/components/chat/message-row";

/**
 * Shown on the assistant side while a turn is in flight.
 *
 * The animation is decorative; the text beside it is what actually conveys the state,
 * so this still reads with animation disabled or on a screen reader. The live region
 * lives in the composer rather than here, to avoid announcing the same thing twice.
 */
export function TypingIndicator() {
  return (
    <MessageRow align="left" className="sm:max-w-[60%]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="size-1.5 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none dark:bg-slate-500"
            />
          ))}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Transcribing and extracting…
        </span>
      </div>
    </MessageRow>
  );
}
