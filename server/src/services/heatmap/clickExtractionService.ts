/**
 * Extract click events from an rrweb event stream into rows for the
 * `session_replay_clicks` table that powers the heatmap UI.
 *
 * Lives in its own module (instead of inline in sessionReplayIngestService)
 * so this fork's heatmap work does not bleed into a shared upstream file —
 * the ingest service only needs a one-line import. See FORK_PATCHES.md.
 *
 * rrweb event taxonomy used here:
 *   type 4         Meta             data: { href, width, height }      -> URL change
 *   type 3 src 2   MouseInteraction  data: { type, x, y, id }           -> click
 *   type 3 src 3   Scroll            data: { id, x, y }                 -> root scroll (id=1)
 *
 * For each click we attach the most recent scroll_y observed (pageY =
 * y + scroll_y) and the current pathname (parsed from Meta href). This
 * lets the heatmap UI render dots aligned with the actual page element
 * even when the iframe is scrolled.
 */

export interface RrwebEventLike {
  type: number | string;
  data: any;
  timestamp: number;
}

export interface HeatmapClickRow {
  site_id: number;
  session_id: string;
  timestamp: number;
  x: number;
  y: number;
  viewport_width: number;
  viewport_height: number;
  click_type: number;
  scroll_x: number;
  scroll_y: number;
  pathname: string;
}

export function extractHeatmapClicks(
  events: RrwebEventLike[],
  siteId: number,
  sessionId: string,
  viewportWidth: number,
  viewportHeight: number,
  initialPageUrl?: string
): HeatmapClickRow[] {
  const clicks: HeatmapClickRow[] = [];

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    console.warn(
      `[heatmap] skipping click extraction for session ${sessionId}: missing viewport dimensions (${viewportWidth}x${viewportHeight})`
    );
    return clicks;
  }

  // Running state walked left-to-right through the event stream so we
  // can attribute each click to the latest scroll position + pathname
  // observed up to that moment.
  let currentScrollX = 0;
  let currentScrollY = 0;
  let currentPathname = "";
  if (initialPageUrl) {
    try {
      currentPathname = new URL(initialPageUrl).pathname || "/";
    } catch {
      // ignore - falls through to "" until we see a Meta event
    }
  }

  for (const event of events) {
    const eventType = typeof event.type === "string" ? Number(event.type) : event.type;
    const data = event.data;
    if (!data) continue;

    // Meta (type 4) -> SPA navigation, refresh pathname for following clicks
    if (eventType === 4) {
      if (typeof data.href === "string") {
        try {
          currentPathname = new URL(data.href).pathname || "/";
        } catch {
          // keep previous
        }
      }
      continue;
    }

    if (eventType !== 3) continue;

    // Scroll (source 3) on the root document (id=1 in rrweb). Some
    // implementations also emit scroll for inner scrollable elements;
    // we only care about the page-level one for heatmap alignment.
    if (data.source === 3 && (data.id === 1 || data.id === undefined)) {
      if (typeof data.x === "number") currentScrollX = data.x;
      if (typeof data.y === "number") currentScrollY = data.y;
      continue;
    }

    // MouseInteraction (source 2): Click (type 2) or DblClick (type 4)
    if (data.source !== 2) continue;
    if (data.type !== 2 && data.type !== 4) continue;

    const x = data.x;
    const y = data.y;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (x < 0 || y < 0) continue;

    clicks.push({
      site_id: siteId,
      session_id: sessionId,
      timestamp: event.timestamp,
      x,
      y,
      viewport_width: viewportWidth,
      viewport_height: viewportHeight,
      click_type: data.type,
      scroll_x: Math.max(0, currentScrollX),
      scroll_y: Math.max(0, currentScrollY),
      pathname: currentPathname,
    });
  }

  return clicks;
}
