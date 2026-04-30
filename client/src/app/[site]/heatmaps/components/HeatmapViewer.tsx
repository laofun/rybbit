"use client";

import { Flame, Loader2, MousePointerClick } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGetClickHeatmap } from "../../../../api/analytics/hooks/heatmap/useGetClickHeatmap";
import { HeatmapCanvas } from "../../../../components/heatmap/HeatmapCanvas";
import { HeatmapMode, ViewportBreakpoint } from "../../../../api/analytics/endpoints/heatmap";
import { HeatmapIntensity, DEFAULT_INTENSITY } from "./HeatmapControls";

interface HeatmapViewerProps {
  pathname: string;
  baseUrl: string;
  viewportBreakpoint: ViewportBreakpoint;
  width: number;
  height: number;
  intensity?: HeatmapIntensity;
  mode?: HeatmapMode;
}

/** Floor for iframe height. Pages with no recorded scroll data (legacy
 *  rows where scroll_y is 0) report pageHeight ≈ viewport_height which
 *  would equal the visible area and prevent scrolling entirely. We give
 *  ourselves at least this much vertical space so the page can render
 *  its full natural height inside the iframe. */
const MIN_IFRAME_HEIGHT = 4000;
/** Cap to avoid pathological values from bad data eating browser memory. */
const MAX_IFRAME_HEIGHT = 20000;
/** When recorded page height is unreliable (≤ this multiple of one
 *  viewport), fall back to MIN_IFRAME_HEIGHT instead. */
const UNRELIABLE_PAGE_HEIGHT_MULT = 1.2;

export function HeatmapViewer({
  pathname,
  baseUrl,
  viewportBreakpoint,
  width,
  height,
  intensity = DEFAULT_INTENSITY,
  mode = "all",
}: HeatmapViewerProps) {
  const { data, isLoading, error } = useGetClickHeatmap({
    pathname,
    viewportBreakpoint,
    gridResolution: 100,
    mode,
  });

  const isRage = mode === "rage";

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset iframe state when the URL changes so loading/error overlays
  // don't stick across page selections (CodeRabbit issue #3).
  const pageUrl = useMemo(() => {
    try {
      const url = new URL(pathname, baseUrl);
      return url.toString();
    } catch {
      return `${baseUrl}${pathname}`;
    }
  }, [pathname, baseUrl]);

  useEffect(() => {
    setIframeLoaded(false);
    setIframeError(false);
    // Also reset scroll position when navigating to a new pathname
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [pageUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-50 dark:bg-neutral-900 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-neutral-50 dark:bg-neutral-900 rounded-lg">
        <p className="text-sm text-red-500">Failed to load heatmap data</p>
        <p className="text-xs text-neutral-400 mt-1">{error.message}</p>
      </div>
    );
  }

  const points = data?.data.points ?? [];
  const totalClicks = data?.data.totalClicks ?? 0;
  const uniqueSessions = data?.data.uniqueSessions ?? 0;
  const refPageHeight = data?.data.pageHeight ?? 0;
  const refViewportWidth = data?.data.viewportWidth || width;
  const refViewportHeight = data?.data.viewportHeight || 0;

  // Visible area for the scroller (everything below the stats bar).
  const visibleHeight = Math.max(200, height - 48);

  // Coordinate-fidelity strategy (same trick Hotjar/Clarity use):
  // render the iframe at its ORIGINAL recorded width so the page lays
  // out exactly as it did when clicks were captured, then visually
  // scale the whole thing down to fit our UI width with CSS transform.
  // This way clicks recorded at clientX=600 in a 1920-wide viewport
  // still land on the same DOM element when displayed at 1200 wide.
  // Without this, responsive layouts shift elements horizontally and
  // dots appear in empty space.
  const scale = refViewportWidth > 0 ? width / refViewportWidth : 1;
  const isReliablePageHeight =
    refPageHeight > 0 &&
    refViewportHeight > 0 &&
    refPageHeight > refViewportHeight * UNRELIABLE_PAGE_HEIGHT_MULT;
  // Iframe natural height (before scale) - either the recorded page
  // height for new data, or a generous default for legacy rows so the
  // user can still scroll.
  const iframeNaturalHeight = isReliablePageHeight
    ? Math.min(MAX_IFRAME_HEIGHT, refPageHeight)
    : MIN_IFRAME_HEIGHT;
  // After scaling, the rendered area is this tall - what the user sees
  // and what the canvas overlay must match.
  const renderedHeight = Math.max(visibleHeight + 100, Math.round(iframeNaturalHeight * scale));
  const iframeNaturalWidth = refViewportWidth || width;

  // Canvas overlay must use the SAME y-normalization basis the server
  // used (refPageHeight). The iframe can be taller (legacy fallback to
  // MIN_IFRAME_HEIGHT for scrollability), but dots are placed as a
  // fraction of refPageHeight, so the canvas only spans that region.
  // Without this the canvas stretches over the whole iframe and dots
  // drift downward proportionally to (iframeNaturalHeight / pageHeight).
  const heatmapHeight =
    refPageHeight > 0 ? Math.max(1, Math.round(refPageHeight * scale)) : renderedHeight;

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-t-lg border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-2 text-sm">
          {isRage ? (
            <Flame className="w-4 h-4 text-orange-500" />
          ) : (
            <MousePointerClick className="w-4 h-4 text-neutral-500" />
          )}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{totalClicks.toLocaleString()}</span>
          <span className="text-neutral-500 dark:text-neutral-400">{isRage ? "rage clusters" : "clicks"}</span>
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          from{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{uniqueSessions.toLocaleString()}</span>{" "}
          sessions
        </div>
      </div>

      {/* Scrollable preview surface. The iframe is rendered at its
          original recorded width and then transform-scaled to fit. The
          outer wrapper is what actually scrolls; canvas sits on top of
          the scaled iframe so dots stay glued to the elements that
          received the clicks. */}
      <div
        ref={scrollerRef}
        className="flex-1 relative bg-white dark:bg-neutral-950 rounded-b-lg overflow-y-auto overflow-x-hidden"
        style={{ height: visibleHeight }}
      >
        <div className="relative" style={{ width: "100%", height: renderedHeight }}>
          {/* Iframe is sized to the recorded viewport width / natural
              page height, then scaled down with CSS transform so the
              page lays out at recording resolution but visually fills
              our UI width. transform-origin top-left so 0,0 maps to
              the same corner as recording. pointer-events: none lets
              wheel scroll bubble to the wrapper. */}
          <iframe
            src={pageUrl}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: iframeNaturalWidth,
              height: iframeNaturalHeight,
              border: 0,
              pointerEvents: "none",
              opacity: iframeLoaded && !iframeError ? 1 : 0.3,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
            title="Page Preview"
          />

          {points.length > 0 && (
            <HeatmapCanvas
              points={points}
              width={width}
              height={heatmapHeight}
              gridResolution={100}
              radius={intensity.radius}
              blur={intensity.blur}
              maxOpacity={intensity.maxOpacity}
              palette={isRage ? "rage" : "spectrum"}
            />
          )}
        </div>

        {/* No-data overlay (sticky inside the scroller so it stays
            visible even after a stray scroll). */}
        {points.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 text-center shadow-lg">
              {isRage ? (
                <Flame className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              ) : (
                <MousePointerClick className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              )}
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {isRage ? "No rage clicks detected" : "No click data for this page"}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {isRage
                  ? "Good news — users aren't furiously clicking here"
                  : "Click data will appear once users interact with this page"}
              </p>
            </div>
          </div>
        )}

        {!iframeLoaded && !iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100/80 dark:bg-neutral-900/80 pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        )}

        {iframeError && (
          <div className="absolute inset-x-0 top-0 p-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-center pointer-events-none">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Unable to load page preview - the page may block iframe embedding (X-Frame-Options / CSP).
              Heatmap dots are still rendered below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
