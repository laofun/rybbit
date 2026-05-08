import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Favicon } from "./Favicon";

describe("Favicon", () => {
  test("uses local fallback when external icon loading is disabled", () => {
    render(<Favicon domain="analytics.lab.destini.vn" className="w-4 h-4" />);

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.queryByAltText("Favicon for analytics.lab.destini.vn")).toBeNull();
  });

  test("falls back to first letter after image load error", () => {
    render(<Favicon domain="example.com" className="w-4 h-4" allowExternal={true} />);

    const image = screen.getByAltText("Favicon for example.com");
    fireEvent.error(image);

    expect(screen.getByText("E")).toBeTruthy();
  });
});
