"use client";

import { Loader2, MousePointerClick } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGetClickHeatmap } from "../../../../api/analytics/hooks/heatmap/useGetClickHeatmap";
import { HeatmapCanvas } from "../../../../components/heatmap/HeatmapCanvas";
import { ViewportBreakpoint } from "../../../../api/analytics/endpoints/heatmap";
import { HeatmapIntensity, DEFAULT_INTENSITY } from "./HeatmapControls";

interface HeatmapViewerProps {
  pathname: string;
  baseUrl: string;
  viewportBreakpoint: ViewportBreakpoint;
  width: number;
  height: number;
  intensity?: HeatmapIntensity;
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
}: HeatmapViewerProps) {
  const { data, isLoading, error } = useGetClickHeatmap({
    pathname,
    viewportBreakpoint,
    gridResolution: 100,
  });

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

  // Visible area for the scroller (everything below the stats bar).
  const visibleHeight = Math.max(200, height - 48);

  // Render iframe at the recorded page height, scaled by ui-width /
  // recorded-viewport-width to preserve aspect ratio. If the recorded
  // height is suspiciously close to one viewport (likely legacy data
  // without scroll context), fall back to a generous default so the
  // user can still scroll the iframe to see the full page.
  const refViewportHeight = data?.data.viewportHeight || 0;
  const scale = refViewportWidth > 0 ? width / refViewportWidth : 1;
  const scaledPageHeight = refPageHeight > 0 ? Math.round(refPageHeight * scale) : 0;
  const isReliablePageHeight =
    refPageHeight > 0 &&
    refViewportHeight > 0 &&
    refPageHeight > refViewportHeight * UNRELIABLE_PAGE_HEIGHT_MULT;
  const iframeHeight = isReliablePageHeight
    ? Math.min(MAX_IFRAME_HEIGHT, Math.max(visibleHeight + 100, scaledPageHeight))
    : MIN_IFRAME_HEIGHT;

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-t-lg border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center gap-2 text-sm">
          <MousePointerClick className="w-4 h-4 text-neutral-500" />
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{totalClicks.toLocaleString()}</span>
          <span className="text-neutral-500 dark:text-neutral-400">clicks</span>
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          from{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{uniqueSessions.toLocaleString()}</span>{" "}
          sessions
        </div>
      </div>

      {/* Scrollable preview surface. The iframe is rendered tall enough to
          fit the recorded page; the wrapper here is what actually scrolls.
          The HeatmapCanvas overlay is positioned absolutely at the same
          height as the iframe so dots scroll WITH the iframe content. */}
      <div
        ref={scrollerRef}
        className="flex-1 relative bg-white dark:bg-neutral-950 rounded-b-lg overflow-y-auto overflow-x-hidden"
        style={{ height: visibleHeight }}
      >
        <div className="relative" style={{ width: "100%", height: iframeHeight }}>
          {/* pointer-events: none lets wheel events bubble up to the
              wrapper so OUR scroll handles the page (the iframe itself
              would otherwise capture them). Trade-off: clicks on links
              inside the iframe are also disabled - acceptable for a
              read-only preview. */}
          <iframe
            src={pageUrl}
            className="absolute inset-0 w-full"
            style={{
              height: iframeHeight,
              border: 0,
              pointerEvents: "none",
              opacity: iframeLoaded && !iframeError ? 1 : 0.3,
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
              height={iframeHeight}
              gridResolution={100}
              radius={intensity.radius}
              blur={intensity.blur}
              maxOpacity={intensity.maxOpacity}
            />
          )}
        </div>

        {/* No-data overlay (sticky inside the scroller so it stays
            visible even after a stray scroll). */}
        {points.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 text-center shadow-lg">
              <MousePointerClick className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                No click data for this page
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Click data will appear once users interact with this page
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
