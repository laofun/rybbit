import { render } from "@testing-library/react";
import { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { useReplayPlayer } from "./useReplayPlayer";

const { rrwebPlayerMock } = vi.hoisted(() => {
  const rrwebPlayerMock = vi.fn(function MockRrwebPlayer() {
    return {
      addEventListener: vi.fn(),
      getMetaData: vi.fn(() => ({ totalTime: 0 })),
      pause: vi.fn(),
      play: vi.fn(),
      triggerResize: vi.fn(),
      $set: vi.fn(),
    };
  });

  return { rrwebPlayerMock };
});

rrwebPlayerMock.mockClear();

vi.mock("rrweb-player", () => ({
  default: rrwebPlayerMock,
}));

vi.mock("../../replayStore", () => ({
  useReplayStore: (selector: (state: any) => any) =>
    selector({
      setPlayer: vi.fn(),
      setCurrentTime: vi.fn(),
      setIsPlaying: vi.fn(),
      setDuration: vi.fn(),
    }),
}));

function Harness({ children }: { children: () => ReactNode }) {
  return <>{children()}</>;
}

function TestComponent() {
  const { playerContainerRef } = useReplayPlayer({
    data: { events: [{ type: 4, timestamp: 1, data: {} }] },
    width: 800,
    height: 600,
  });

  return <div ref={playerContainerRef} id="target" />;
}

describe("useReplayPlayer", () => {
  test("initializes rrwebPlayer with replay scripts enabled", () => {
    render(
      <Harness>
        {() => <TestComponent />}
      </Harness>
    );

    expect(rrwebPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          UNSAFE_replayCanvas: true,
        }),
      })
    );
  });
});
