import { FilterParams } from "@rybbit/shared";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { getFilterStatement } from "../../api/analytics/utils/getFilterStatement.js";
import { getTimeStatement, processResults } from "../../api/analytics/utils/utils.js";

export interface HeatmapDataPoint {
  x: number; // 0..gridResolution (page-relative grid cell, X axis)
  y: number; // 0..gridResolution (page-relative grid cell, Y axis)
  value: number; // click count in this cell
}

export interface ClickHeatmapResult {
  points: HeatmapDataPoint[];
  totalClicks: number;
  uniqueSessions: number;
  /** Reference page height (px) used to normalize y. Frontend should size
   *  the canvas to this value (or scale proportionally). */
  pageHeight: number;
  /** Reference viewport width used to normalize x. */
  viewportWidth: number;
  /** Reference viewport height (px) - used by the UI to know "one fold". */
  viewportHeight: number;
}

export interface HeatmapPage {
  pathname: string;
  clickCount: number;
  sessionCount: number;
}

type ViewportBreakpoint = "mobile" | "tablet" | "desktop" | "all";
export type PathMatchMode = "exact" | "prefix";

const VIEWPORT_BREAKPOINTS = {
  mobile: { max: 768 },
  tablet: { min: 769, max: 1024 },
  desktop: { min: 1025 },
} as const;

/**
 * Build a session-level filter clause that restricts heatmap results to
 * sessions whose `events` rows match the dashboard filters. Heatmap
 * queries pull from `session_replay_clicks` which doesn't carry filter
 * columns (browser, country, etc.) — so we narrow by session_id via a
 * subquery against `events` instead. Sessions with no matching events
 * row drop out, which is the correct behaviour: filters describe event
 * metadata that the click rows alone can't satisfy.
 */
function getSessionFilterClause(siteId: number, options: FilterParams<unknown>): string {
  const filterStatement = getFilterStatement(options.filters ?? "", siteId);
  if (!filterStatement) return "";
  const eventsTimeStatement = getTimeStatement(options);
  return `AND src.session_id IN (
    SELECT DISTINCT session_id
    FROM events
    WHERE site_id = {siteId:UInt16}
      ${eventsTimeStatement}
      ${filterStatement}
  )`;
}

function getPathnameClause(matchMode: PathMatchMode): string {
  if (matchMode === "prefix") {
    return `AND (startsWith(src.pathname, {pathname:String})
             OR (src.pathname = '' AND startsWith(path(srm.page_url), {pathname:String})))`;
  }
  return `AND (src.pathname = {pathname:String}
             OR (src.pathname = '' AND path(srm.page_url) = {pathname:String}))`;
}

function getViewportCondition(breakpoint: ViewportBreakpoint): string {
  if (breakpoint === "all") return "";

  const bp = VIEWPORT_BREAKPOINTS[breakpoint];
  if ("max" in bp && !("min" in bp)) {
    return `AND viewport_width <= ${bp.max}`;
  }
  if ("min" in bp && "max" in bp) {
    return `AND viewport_width >= ${bp.min} AND viewport_width <= ${bp.max}`;
  }
  if ("min" in bp && !("max" in bp)) {
    return `AND viewport_width >= ${bp.min}`;
  }
  return "";
}

export class ClickHeatmapService {
  /**
   * Get aggregated click data for heatmap visualization.
   *
   * Coordinates are PAGE-relative (page_y = y + scroll_y) so the heatmap
   * dots stay aligned with elements when the iframe is scrolled. The
   * reference page height is the max page_y observed across all sampled
   * clicks (an over-estimate of fold count is harmless - the UI just gets
   * a slightly taller canvas with empty space at the bottom).
   *
   * The pathname filter prefers the click row's own pathname (recorded
   * from rrweb Meta events for SPA navigations) and falls back to the
   * session metadata page_url for legacy rows where pathname is empty.
   */
  async getClickHeatmap(
    siteId: number,
    pathname: string,
    options: FilterParams<{
      viewportBreakpoint?: ViewportBreakpoint;
      gridResolution?: number; // Number of grid cells (default 100 = 1% resolution)
      matchMode?: PathMatchMode;
    }>
  ): Promise<ClickHeatmapResult> {
    const { viewportBreakpoint = "all", gridResolution = 100, matchMode = "exact" } = options;
    const pathnameClause = getPathnameClause(matchMode);

    const timeStatement = getTimeStatement(options).replace(/timestamp/g, "src.timestamp");
    const viewportCondition = getViewportCondition(viewportBreakpoint).replace(
      /viewport_width/g,
      "src.viewport_width"
    );
    const sessionFilter = getSessionFilterClause(siteId, options);

    const cleanPathname = pathname.replace(/\/+$/, "") || "/";

    // First pass: figure out the reference page height for this pathname.
    // We use the max (y + scroll_y) we have seen so the canvas in the UI
    // can be sized to cover every recorded click.
    const dimsQuery = `
      SELECT
        toUInt32(max(src.y + src.scroll_y)) AS pageHeight,
        toUInt16(any(src.viewport_width))   AS viewportWidth,
        toUInt16(any(src.viewport_height))  AS viewportHeight
      FROM session_replay_clicks src
      INNER JOIN session_replay_metadata srm
        ON src.session_id = srm.session_id AND src.site_id = srm.site_id
      WHERE src.site_id = {siteId:UInt16}
        AND src.viewport_width > 0
        AND src.viewport_height > 0
        ${pathnameClause}
        ${viewportCondition}
        ${timeStatement}
        ${sessionFilter}
    `;

    const dimsResult = await clickhouse.query({
      query: dimsQuery,
      query_params: { siteId, pathname: cleanPathname },
      format: "JSONEachRow",
    });
    const dimsRows = await processResults<{
      pageHeight: number;
      viewportWidth: number;
      viewportHeight: number;
    }>(dimsResult);
    const dims = dimsRows[0] ?? { pageHeight: 0, viewportWidth: 0, viewportHeight: 0 };

    // If we have no clicks at all return early - downstream queries would
    // succeed with empty results but we save two round trips.
    if (!dims.pageHeight) {
      return {
        points: [],
        totalClicks: 0,
        uniqueSessions: 0,
        pageHeight: dims.viewportHeight || 0,
        viewportWidth: dims.viewportWidth || 0,
        viewportHeight: dims.viewportHeight || 0,
      };
    }

    // pageHeight must be at least one viewport so we never divide by 0
    // and so the UI canvas is at least as tall as one fold.
    const pageHeight = Math.max(dims.pageHeight, dims.viewportHeight || 1);

    // Page-relative grid cells. x normalized by viewport width (as before
    // - horizontal layout is responsive and clicks bucket nicely there);
    // y normalized by the computed pageHeight so dots scale correctly to
    // a tall canvas in the UI.
    const query = `
      SELECT
        ROUND(src.x / src.viewport_width * {gridResolution:UInt16}, 0) AS x,
        ROUND((src.y + src.scroll_y) / {pageHeight:UInt32} * {gridResolution:UInt16}, 0) AS y,
        COUNT(*) AS value
      FROM session_replay_clicks src
      INNER JOIN session_replay_metadata srm
        ON src.session_id = srm.session_id AND src.site_id = srm.site_id
      WHERE src.site_id = {siteId:UInt16}
        AND src.viewport_width > 0
        AND src.viewport_height > 0
        AND src.x >= 0 AND src.y >= 0
        AND src.x <= src.viewport_width
        AND src.y <= src.viewport_height
        ${pathnameClause}
        ${viewportCondition}
        ${timeStatement}
        ${sessionFilter}
      GROUP BY x, y
      HAVING value >= 1
      ORDER BY value DESC
      LIMIT 10000
    `;

    const statsQuery = `
      SELECT
        COUNT(*) AS totalClicks,
        COUNT(DISTINCT src.session_id) AS uniqueSessions
      FROM session_replay_clicks src
      INNER JOIN session_replay_metadata srm
        ON src.session_id = srm.session_id AND src.site_id = srm.site_id
      WHERE src.site_id = {siteId:UInt16}
        AND src.viewport_width > 0
        AND src.viewport_height > 0
        ${pathnameClause}
        ${viewportCondition}
        ${timeStatement}
        ${sessionFilter}
    `;

    const [pointsResult, statsResult] = await Promise.all([
      clickhouse.query({
        query,
        query_params: { siteId, pathname: cleanPathname, gridResolution, pageHeight },
        format: "JSONEachRow",
      }),
      clickhouse.query({
        query: statsQuery,
        query_params: { siteId, pathname: cleanPathname },
        format: "JSONEachRow",
      }),
    ]);

    const points = await processResults<HeatmapDataPoint>(pointsResult);
    const stats = await processResults<{ totalClicks: number; uniqueSessions: number }>(statsResult);

    return {
      points,
      totalClicks: stats[0]?.totalClicks ?? 0,
      uniqueSessions: stats[0]?.uniqueSessions ?? 0,
      pageHeight,
      viewportWidth: dims.viewportWidth,
      viewportHeight: dims.viewportHeight,
    };
  }

  /**
   * Get rage-click hotspots: clusters of 3+ clicks within 50px in 1.5s
   * inside the same session. The result reuses ClickHeatmapResult so the
   * UI can render it through the same canvas. Each grid cell value is
   * the number of distinct rage incidents (one per session per cluster),
   * not raw click count.
   */
  async getRageClicks(
    siteId: number,
    pathname: string,
    options: FilterParams<{
      viewportBreakpoint?: ViewportBreakpoint;
      gridResolution?: number;
      matchMode?: PathMatchMode;
    }>
  ): Promise<ClickHeatmapResult> {
    const { viewportBreakpoint = "all", gridResolution = 100, matchMode = "exact" } = options;
    const pathnameClause = getPathnameClause(matchMode);

    const timeStatement = getTimeStatement(options).replace(/timestamp/g, "src.timestamp");
    const viewportCondition = getViewportCondition(viewportBreakpoint).replace(
      /viewport_width/g,
      "src.viewport_width"
    );
    const sessionFilter = getSessionFilterClause(siteId, options);

    const cleanPathname = pathname.replace(/\/+$/, "") || "/";

    // Reference dimensions identical to getClickHeatmap so canvas sizing
    // matches up if the user toggles between modes.
    const dimsQuery = `
      SELECT
        toUInt32(max(src.y + src.scroll_y)) AS pageHeight,
        toUInt16(any(src.viewport_width))   AS viewportWidth,
        toUInt16(any(src.viewport_height))  AS viewportHeight
      FROM session_replay_clicks src
      INNER JOIN session_replay_metadata srm
        ON src.session_id = srm.session_id AND src.site_id = srm.site_id
      WHERE src.site_id = {siteId:UInt16}
        AND src.viewport_width > 0
        AND src.viewport_height > 0
        ${pathnameClause}
        ${viewportCondition}
        ${timeStatement}
        ${sessionFilter}
    `;

    const dimsResult = await clickhouse.query({
      query: dimsQuery,
      query_params: { siteId, pathname: cleanPathname },
      format: "JSONEachRow",
    });
    const dimsRows = await processResults<{
      pageHeight: number;
      viewportWidth: number;
      viewportHeight: number;
    }>(dimsResult);
    const dims = dimsRows[0] ?? { pageHeight: 0, viewportWidth: 0, viewportHeight: 0 };

    if (!dims.pageHeight) {
      return {
        points: [],
        totalClicks: 0,
        uniqueSessions: 0,
        pageHeight: dims.viewportHeight || 0,
        viewportWidth: dims.viewportWidth || 0,
        viewportHeight: dims.viewportHeight || 0,
      };
    }

    const pageHeight = Math.max(dims.pageHeight, dims.viewportHeight || 1);

    // CTE clusters clicks per session into 50x50 px buckets in absolute
    // page coordinates, keeps clusters with >= 3 clicks within 1500ms.
    // The outer query renormalizes the cluster centroids onto the same
    // grid the regular click heatmap uses so the UI can swap modes
    // without changing canvas math.
    const query = `
      WITH rage_incidents AS (
        SELECT
          src.session_id AS session_id,
          toUInt32(src.x / 50)                     AS gx,
          toUInt32((src.y + src.scroll_y) / 50)    AS gy,
          count()                                  AS click_count,
          dateDiff('millisecond', min(src.timestamp), max(src.timestamp)) AS time_span_ms,
          avg(src.x)                               AS avg_x,
          avg(src.y + src.scroll_y)                AS avg_page_y,
          any(src.viewport_width)                  AS vw
        FROM session_replay_clicks src
        INNER JOIN session_replay_metadata srm
          ON src.session_id = srm.session_id AND src.site_id = srm.site_id
        WHERE src.site_id = {siteId:UInt16}
          AND src.viewport_width > 0
          AND src.viewport_height > 0
          AND src.x >= 0 AND src.y >= 0
          AND src.x <= src.viewport_width
          AND src.y <= src.viewport_height
          ${pathnameClause}
          ${viewportCondition}
          ${timeStatement}
          ${sessionFilter}
        GROUP BY src.session_id, gx, gy
        HAVING click_count >= 3 AND time_span_ms <= 1500 AND vw > 0
      )
      SELECT
        ROUND(avg_x / vw * {gridResolution:UInt16}, 0)              AS x,
        ROUND(avg_page_y / {pageHeight:UInt32} * {gridResolution:UInt16}, 0) AS y,
        count()                                                     AS value
      FROM rage_incidents
      GROUP BY x, y
      HAVING value >= 1
      ORDER BY value DESC
      LIMIT 10000
    `;

    const statsQuery = `
      WITH rage_incidents AS (
        SELECT src.session_id AS session_id
        FROM session_replay_clicks src
        INNER JOIN session_replay_metadata srm
          ON src.session_id = srm.session_id AND src.site_id = srm.site_id
        WHERE src.site_id = {siteId:UInt16}
          AND src.viewport_width > 0
          AND src.viewport_height > 0
          ${pathnameClause}
          ${viewportCondition}
          ${timeStatement}
          ${sessionFilter}
        GROUP BY src.session_id, toUInt32(src.x / 50), toUInt32((src.y + src.scroll_y) / 50)
        HAVING count() >= 3
           AND dateDiff('millisecond', min(src.timestamp), max(src.timestamp)) <= 1500
      )
      SELECT
        count()                          AS totalClicks,
        count(DISTINCT session_id)       AS uniqueSessions
      FROM rage_incidents
    `;

    const [pointsResult, statsResult] = await Promise.all([
      clickhouse.query({
        query,
        query_params: { siteId, pathname: cleanPathname, gridResolution, pageHeight },
        format: "JSONEachRow",
      }),
      clickhouse.query({
        query: statsQuery,
        query_params: { siteId, pathname: cleanPathname },
        format: "JSONEachRow",
      }),
    ]);

    const points = await processResults<HeatmapDataPoint>(pointsResult);
    const stats = await processResults<{ totalClicks: number; uniqueSessions: number }>(statsResult);

    return {
      points,
      totalClicks: stats[0]?.totalClicks ?? 0,
      uniqueSessions: stats[0]?.uniqueSessions ?? 0,
      pageHeight,
      viewportWidth: dims.viewportWidth,
      viewportHeight: dims.viewportHeight,
    };
  }

  /**
   * Get list of pages that have click data for heatmaps. Pages are
   * resolved from src.pathname when present (covers SPA route changes
   * after the session started) and fall back to session metadata.
   */
  async getHeatmapPages(
    siteId: number,
    options: FilterParams<{
      limit?: number;
    }>
  ): Promise<HeatmapPage[]> {
    const { limit = 100 } = options;

    const timeStatement = getTimeStatement(options).replace(/timestamp/g, "src.timestamp");
    const sessionFilter = getSessionFilterClause(siteId, options);

    const query = `
      SELECT
        if(src.pathname != '', src.pathname, path(srm.page_url)) AS pathname,
        COUNT(*) AS clickCount,
        COUNT(DISTINCT src.session_id) AS sessionCount
      FROM session_replay_clicks src
      INNER JOIN session_replay_metadata srm
        ON src.session_id = srm.session_id AND src.site_id = srm.site_id
      WHERE src.site_id = {siteId:UInt16}
        ${timeStatement}
        ${sessionFilter}
      GROUP BY pathname
      ORDER BY clickCount DESC
      LIMIT {limit:UInt32}
    `;

    const result = await clickhouse.query({
      query,
      query_params: { siteId, limit },
      format: "JSONEachRow",
    });

    const pages = await processResults<HeatmapPage>(result);

    return pages;
  }
}

export const clickHeatmapService = new ClickHeatmapService();
