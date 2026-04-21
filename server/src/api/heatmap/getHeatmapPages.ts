import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickHeatmapService } from "../../services/heatmap/clickHeatmapService.js";

export interface GetHeatmapPagesRequest {
  Params: {
    siteId: string;
  };
  Querystring: FilterParams<{
    limit?: string;
  }>;
}

export async function getHeatmapPages(req: FastifyRequest<GetHeatmapPagesRequest>, res: FastifyReply) {
  const { limit, ...filterParams } = req.query;
  const siteId = Number(req.params.siteId);

  if (!Number.isFinite(siteId) || siteId <= 0 || siteId > 65535) {
    return res.status(400).send({ error: "invalid siteId" });
  }

  const parsedLimit = limit ? Number(limit) : 100;
  const clampedLimit = Number.isFinite(parsedLimit)
    ? Math.min(1000, Math.max(1, Math.floor(parsedLimit)))
    : 100;

  try {
    const pages = await clickHeatmapService.getHeatmapPages(siteId, {
      ...filterParams,
      limit: clampedLimit,
    });

    return res.send({
      data: pages,
    });
  } catch (error) {
    console.error("Error fetching heatmap pages:", error);
    return res.status(500).send({ error: "Failed to fetch heatmap pages" });
  }
}
