import { MessageRow } from "@/components/chat/message-row";
import type { UserMessage as UserMessageModel } from "@/components/chat/types";

/**
 * One spoken turn, on the right.
 *
 * While `pending` the transcript does not exist yet — the row is already on screen so
 * that pressing send visibly registers, which matters more here than in a typed chat
 * because there is no text the user can see themselves having written.
 */
export function UserMessage({ message }: { message: UserMessageModel }) {
  const isPending = message.status === "pending";

  return (
    <MessageRow align="right">
      {isPending ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          Transcribing…
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
          {message.transcript}
        </p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
        {message.selectedPosition !== null ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            chose #{message.selectedPosition}
          </span>
        ) : null}

        {/* Which engine heard this, on the turn it applies to. Comparing engines is
            the point of the picker, and that only means something if the result says
            which one ran. */}
        {message.transcription !== null ? (
          <>
            <span>{message.transcription.label}</span>
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
              {message.transcription.model}
            </code>
            <span>{(message.transcription.latencyMs / 1000).toFixed(1)}s</span>
            {message.transcription.keytermCount > 0 ? (
              <span>
                {message.transcription.keytermCount} boosted{" "}
                {message.transcription.keytermCount === 1 ? "name" : "names"}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </MessageRow>
  );
}
