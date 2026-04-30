import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickHeatmapService } from "../../services/heatmap/clickHeatmapService.js";

export type HeatmapMode = "all" | "rage";

export interface GetClickHeatmapRequest {
  Params: {
    siteId: string;
  };
  Querystring: FilterParams<{
    pathname: string;
    viewportBreakpoint?: "mobile" | "tablet" | "desktop" | "all";
    gridResolution?: string;
    mode?: HeatmapMode;
    matchMode?: "exact" | "prefix";
  }>;
}

export async function getClickHeatmap(req: FastifyRequest<GetClickHeatmapRequest>, res: FastifyReply) {
  const { pathname, viewportBreakpoint, gridResolution, mode, matchMode, ...filterParams } = req.query;
  const siteId = Number(req.params.siteId);

  if (!Number.isFinite(siteId) || siteId <= 0 || siteId > 65535) {
    return res.status(400).send({ error: "invalid siteId" });
  }

  if (!pathname) {
    return res.status(400).send({ error: "pathname is required" });
  }

  const parsedGridResolution = gridResolution ? Number(gridResolution) : 100;
  const clampedGridResolution = Number.isFinite(parsedGridResolution)
    ? Math.min(500, Math.max(10, Math.floor(parsedGridResolution)))
    : 100;

  const normalizedMode: HeatmapMode = mode === "rage" ? "rage" : "all";
  const normalizedMatchMode: "exact" | "prefix" = matchMode === "prefix" ? "prefix" : "exact";

  try {
    const serviceOpts = {
      ...filterParams,
      viewportBreakpoint: viewportBreakpoint || "all",
      gridResolution: clampedGridResolution,
      matchMode: normalizedMatchMode,
    };

    const result =
      normalizedMode === "rage"
        ? await clickHeatmapService.getRageClicks(siteId, pathname, serviceOpts)
        : await clickHeatmapService.getClickHeatmap(siteId, pathname, serviceOpts);

    return res.send({
      data: result,
      pathname,
      mode: normalizedMode,
    });
  } catch (error) {
    console.error("Error fetching click heatmap:", error);
    return res.status(500).send({ error: "Failed to fetch click heatmap data" });
  }
}
