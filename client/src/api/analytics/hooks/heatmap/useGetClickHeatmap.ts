import { useQuery } from "@tanstack/react-query";
import { useStore } from "../../../../lib/store";
import { buildApiParams } from "../../../utils";
import { fetchClickHeatmap, HeatmapMode, PathMatchMode, ViewportBreakpoint } from "../../endpoints/heatmap";

interface UseGetClickHeatmapOptions {
  pathname: string;
  viewportBreakpoint?: ViewportBreakpoint;
  gridResolution?: number;
  mode?: HeatmapMode;
  matchMode?: PathMatchMode;
  enabled?: boolean;
}

export function useGetClickHeatmap({
  pathname,
  viewportBreakpoint = "all",
  gridResolution = 100,
  mode = "all",
  matchMode = "exact",
  enabled = true,
}: UseGetClickHeatmapOptions) {
  const { time, site, filters, timezone } = useStore();
  const params = buildApiParams(time, { filters });

  return useQuery({
    queryKey: [
      "click-heatmap",
      site,
      pathname,
      viewportBreakpoint,
      gridResolution,
      mode,
      matchMode,
      time,
      filters,
      timezone,
    ],
    queryFn: () =>
      fetchClickHeatmap(site, {
        ...params,
        pathname,
        viewportBreakpoint,
        gridResolution,
        mode,
        matchMode,
      }),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: !!site && !!pathname && enabled,
  });
}
