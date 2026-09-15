"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  ResolutionStatus,
  UserCandidate,
} from "@/lib/matching/name-match";
import type { UserSearchResponse } from "@/types/api";

type UserPickerProps = {
  status: ResolutionStatus;
  candidates: UserCandidate[];
  selectedUserId: number | null;
  /** The name the extractor heard, shown when nothing matched. */
  searchedFor: string | null;
  disabled: boolean;
  onSelect: (userId: number) => void;
  onCandidatesReplaced: (
    candidates: UserCandidate[],
    selectedUserId: number | null,
    status: ResolutionStatus,
  ) => void;
};

/**
 * Who the meeting belongs to.
 *
 * Ambiguity is never hidden: when more than one person matches, nothing is
 * preselected and the user has to choose. A single confident match is
 * preselected but stays visible and changeable, so an automatic decision is
 * always apparent and always reversible.
 */
export function UserPicker({
  status,
  candidates,
  selectedUserId,
  searchedFor,
  disabled,
  onSelect,
  onCandidatesReplaced,
}: UserPickerProps) {
  const [term, setTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(status === "unresolved");

  const runSearch = useCallback(async () => {
    const trimmed = term.trim();
    if (trimmed.length === 0 || isSearching) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/users/search?q=${encodeURIComponent(trimmed)}`,
      );
      const payload = (await response.json()) as UserSearchResponse;

      if (!response.ok || payload.success === false) {
        setSearchError(
          payload.success === false ? payload.error : "That search failed.",
        );
        return;
      }

      if (payload.candidates.length === 0) {
        setSearchError(`No one in the directory matches "${trimmed}".`);
        return;
      }

      onCandidatesReplaced(
        payload.candidates,
        payload.selectedUserId,
        payload.status,
      );
    } catch {
      setSearchError("We couldn't reach the server. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [isSearching, onCandidatesReplaced, term]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Who is this meeting for?
        </span>

        {candidates.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowSearch((open) => !open)}
            disabled={disabled}
            className="text-xs font-medium text-indigo-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
          >
            {showSearch ? "Hide search" : "Someone else?"}
          </button>
        ) : null}
      </div>

      {status === "ambiguous" && candidates.length > 1 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          More than one person matches. Choose the right one before saving.
        </p>
      ) : null}

      {status === "unresolved" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {searchedFor === null
            ? "No name was mentioned in the recording. Search for the person below."
            : `No directory match for "${searchedFor}". Search for the person below.`}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <ul className="space-y-2">
          {candidates.map((candidate) => {
            const isSelected = candidate.id === selectedUserId;

            return (
              <li key={candidate.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="meeting-user"
                    value={candidate.id}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => onSelect(candidate.id)}
                    className="size-4 shrink-0 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                      {candidate.label}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Directory ID {candidate.id}
                      {candidate.score < 1
                        ? ` · ${Math.round(candidate.score * 100)}% name match`
                        : " · exact name match"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showSearch ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <label
            htmlFor="user-search"
            className="block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Search the directory by name
          </label>

          <div className="flex gap-2">
            <input
              id="user-search"
              type="search"
              value={term}
              disabled={disabled || isSearching}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runSearch();
                }
              }}
              placeholder="e.g. Amanda Wilson"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            <Button
              variant="secondary"
              onClick={() => void runSearch()}
              disabled={disabled || isSearching || term.trim().length === 0}
            >
              {isSearching ? "Searching…" : "Search"}
            </Button>
          </div>

          {searchError !== null ? (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {searchError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
