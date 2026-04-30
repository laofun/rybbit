"use client";

import { FileText, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { HeatmapPage } from "../../../../api/analytics/endpoints/heatmap";
import { cn } from "../../../../lib/utils";

interface HeatmapPageListProps {
  pages: HeatmapPage[];
  selectedPathname: string | null;
  onSelectPage: (pathname: string) => void;
  isLoading: boolean;
}

type SortKey = "clicks" | "sessions" | "path";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "clicks", label: "Clicks" },
  { value: "sessions", label: "Sessions" },
  { value: "path", label: "Path" },
];

export function HeatmapPageList({ pages, selectedPathname, onSelectPage, isLoading }: HeatmapPageListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [search, setSearch] = useState("");

  const visiblePages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? pages.filter((p) => p.pathname.toLowerCase().includes(needle))
      : pages;
    const sorted = [...filtered];
    if (sortKey === "clicks") {
      sorted.sort((a, b) => b.clickCount - a.clickCount);
    } else if (sortKey === "sessions") {
      sorted.sort((a, b) => b.sessionCount - a.sessionCount);
    } else {
      sorted.sort((a, b) => a.pathname.localeCompare(b.pathname));
    }
    return sorted;
  }, [pages, sortKey, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <FileText className="w-8 h-8 text-neutral-400 mb-2" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No pages with click data found</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          Click data will appear once session replay captures user interactions
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 px-2 pt-1 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter pages..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">
            Sort
          </span>
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sortKey === option.value}
                onClick={() => setSortKey(option.value)}
                className={cn(
                  "px-2 py-0.5 text-[11px] rounded transition-colors",
                  sortKey === option.value
                    ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 px-2 py-1 uppercase tracking-wide">
        Pages ({visiblePages.length}
        {visiblePages.length !== pages.length ? ` / ${pages.length}` : ""})
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto flex-1">
        {visiblePages.length === 0 ? (
          <div className="text-xs text-neutral-400 dark:text-neutral-500 px-3 py-2">No matches</div>
        ) : (
          visiblePages.map((page) => (
            <button
              key={page.pathname}
              onClick={() => onSelectPage(page.pathname)}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors",
                "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                selectedPathname === page.pathname &&
                  "bg-neutral-100 dark:bg-neutral-800 ring-1 ring-neutral-200 dark:ring-neutral-700"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {page.pathname}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {page.sessionCount.toLocaleString()} sessions
                </div>
              </div>
              <div className="ml-2 px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {page.clickCount.toLocaleString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
