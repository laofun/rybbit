import { describe, expect, test } from "vitest";
import { buildDashedLinePath } from "./Chart";

describe("buildDashedLinePath", () => {
  test("returns an empty path for invalid dashed line segments with missing coordinates", () => {
    const path = buildDashedLinePath(
      [
        { x: null, y: 10 },
        { x: 20, y: null },
      ],
      () => null
    );

    expect(path).toBe("");
  });
});

