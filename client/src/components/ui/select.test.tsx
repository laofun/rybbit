import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

function TestSelect({ value }: { value?: string }) {
  return (
    <Select value={value} onValueChange={() => {}}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="GET">GET</SelectItem>
        <SelectItem value="POST">POST</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  test("warns when switching from uncontrolled to controlled", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rerender } = render(<TestSelect value={undefined} />);
    rerender(<TestSelect value="GET" />);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Select is changing from uncontrolled to controlled")
    );
  });
});
