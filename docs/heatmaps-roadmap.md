# Heatmaps Roadmap — học từ Microsoft Clarity

So sánh tính năng Rybbit hiện tại với Clarity, đề xuất roadmap nâng cấp.

## Hiện trạng Rybbit (sau PR #819 + heatmaps-integration)

- **Click heatmap**: aggregate clicks theo grid 100x100, color gradient blue→red
- **Viewport filter**: All / Desktop / Tablet / Mobile
- **Page list**: liệt kê pages có click data
- **Iframe preview**: render trang gốc, overlay click dots

## Clarity tính năng tham chiếu

| Loại heatmap | Clarity | Rybbit | Gap |
|---|---|---|---|
| **Click map** — All clicks | ✅ | ✅ | — |
| **Click map** — Dead clicks (click không có effect) | ✅ | ❌ | High value |
| **Click map** — Rage clicks (3+ clicks/1.5s cùng vùng) | ✅ | ❌ | High value, low effort |
| **Click map** — Error clicks (click → JS error) | ✅ | ❌ | Medium |
| **Click map** — First/Last clicks per session | ✅ | ❌ | Low effort |
| **Scroll map** (% users reach depth Y) | ✅ | ❌ | **Critical** — feature đặc trưng Clarity |
| **Area map** (group click theo element) | ✅ | ❌ | High effort (cần selector tracking) |
| **Conversion map** | ✅ | ❌ | Cần goal correlation |
| **Attention map** (time spent per area) | ✅ | ❌ | Expensive (cursor data) |
| **Heatmap compare** (2 periods) | ✅ | ❌ | UI complex |
| **Filter integration** (browser/device/country) | ✅ | ❌ partial | Low effort |
| **URL parameter toggle** (exact vs prefix) | ✅ | ❌ | Low effort |
| **Export image** | ✅ | ❌ | Low effort |
| **Intensity controls** (radius/blur slider) | ✅ | ❌ | Low effort |

## Roadmap đề xuất — sắp xếp theo value/effort

### Phase 1 — Quick wins UI (1-2 ngày)

Cải thiện UX hiện có, không thay đổi schema:

- [x] iframe scroll enabled (đã commit)
- [ ] **Intensity sliders**: radius (10-50), blur (0-30), opacity (0.3-1.0) trong HeatmapControls
- [ ] **Export PNG**: capture canvas + iframe screenshot → download
- [ ] **Filter integration**: link với rybbit global filters (browser/device/country/referrer) qua existing filter store
- [ ] **Page list improvements**: sort options (clicks DESC / sessions DESC / pathname ASC), session count visible
- [ ] **URL parameter toggle**: switch giữa exact match và prefix match cho pathname

**Files ảnh hưởng**: chỉ client-side, ~150 LOC.

### Phase 2 — Scroll heatmap (3-5 ngày) ⭐ Critical

Feature đặc trưng Clarity, value cao nhất. Cần thêm schema + ingest.

**Schema mới** (ClickHouse):
```sql
CREATE TABLE session_replay_scrolls (
  site_id UInt16,
  session_id String,
  pathname String,
  max_scroll_y UInt32,        -- pixel scrolled max trong session/pathname
  page_height UInt32,           -- chiều cao tổng page
  viewport_height UInt16,
  timestamp DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (site_id, pathname, timestamp)
TTL timestamp + INTERVAL 30 DAY;
```

**Ingest**: trong `sessionReplayIngestService.extractClickEvents`, parse rrweb scroll events (type 3, source 3) → take MAX scrollY per session per pathname.

**API**: `GET /sites/:siteId/heatmap/scroll?pathname=...` → return percentile data:
```json
{
  "fold": 720,           // average viewport height (px from top)
  "buckets": [           // mỗi bucket = 5% chiều cao page
    { "depth_pct": 5, "reach_pct": 100 },
    { "depth_pct": 10, "reach_pct": 95 },
    ...
    { "depth_pct": 100, "reach_pct": 12 }
  ]
}
```

**UI**: gradient bar overlay phía bên trái iframe (đỏ = nhiều người xem, xanh = ít). Đường ngang đậm tại "average fold". Tooltip hover: "X% users scrolled here".

**Files**: ~400 LOC, thêm 1 service + 1 API + 1 component.

### Phase 3 — Smart click insights (2-3 ngày)

Leverage data click sẵn có, không cần schema mới.

#### Rage clicks (low effort, high value)
Detect: 3+ clicks trong cùng vùng 50px radius trong 1500ms.

**SQL** (window function aggregate):
```sql
SELECT site_id, session_id, pathname,
  toUInt32(x / 50) AS gx, toUInt32(y / 50) AS gy,
  count() AS click_count,
  max(timestamp) - min(timestamp) AS time_span
FROM session_replay_clicks
WHERE site_id = ? AND timestamp > ?
GROUP BY site_id, session_id, pathname, gx, gy
HAVING click_count >= 3 AND time_span <= 1500
```

UI: tab "Rage clicks" trong HeatmapControls, render heatmap chỉ chứa các cluster rage.

#### Dead clicks (medium effort)
Detect: click không có pageview/event mới trong N giây sau đó.

Cần JOIN session_replay_clicks với events table theo session_id + timestamp.

#### First / Last clicks (low effort)
SQL `argMin(x, timestamp)` / `argMax(x, timestamp)` per session per pathname.

Tab toggle trong HeatmapControls.

#### Error clicks
Click + JS error trong 5 giây sau. Cần error events ingest (rybbit đã có).

### Phase 4 — Advanced (long term)

- **Area maps**: thêm element selector vào click ingest. Aggregate click theo CSS selector.
- **Period compare**: split-screen 2 heatmaps side-by-side với 2 time range.
- **Conversion maps**: correlate clicks với goal completions từ rybbit goals.
- **Attention maps**: ingest rrweb mouse-move events (source 6), aggregate dwell time per area. Storage cost cao.

## Quyết định kiến trúc

### Schema strategy
Dùng bảng riêng (như `session_replay_clicks` đã làm) cho mỗi loại data → query nhanh, dễ TTL. Không re-parse rrweb event blobs lúc query.

### UI strategy
Mở rộng `HeatmapsPage` thành tabs:
```
[Click maps ▾] [Scroll maps] [Insights]
  ├─ All clicks
  ├─ Rage clicks
  ├─ Dead clicks
  ├─ First clicks
  └─ Last clicks
```

Heatmap mode lưu vào URL state qua `nuqs` để shareable link.

### Performance
- Tất cả query có time filter + site_id filter (đã indexed via ORDER BY)
- Grid resolution capped 10-500 (đã làm)
- LIMIT 10000 trên points result
- Cache React Query với staleTime 60s

## Ưu tiên ship

1. **Sprint 1 (1 tuần)**: Phase 1 toàn bộ + Phase 3 rage clicks
2. **Sprint 2 (1 tuần)**: Phase 2 scroll heatmap end-to-end
3. **Sprint 3+ (sau khi dogfood)**: Phase 3 còn lại + chọn lọc Phase 4

## Tham chiếu

- [Clarity Heatmaps Overview](https://learn.microsoft.com/en-us/clarity/heatmaps/heatmaps-overview)
- [Clarity Click Maps](https://learn.microsoft.com/en-us/clarity/heatmaps/click-maps)
- [Clarity Scroll Maps](https://learn.microsoft.com/en-us/clarity/heatmaps/scroll-maps)
- [Clarity Insights](https://learn.microsoft.com/en-us/clarity/insights/insights-overview)
