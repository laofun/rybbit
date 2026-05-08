import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStore } from "../../../lib/store";
import { useGetSessions } from "./useGetUserSessions";

const { authedFetchMock } = vi.hoisted(() => ({
  authedFetchMock: vi.fn(),
}));

vi.mock("../../utils", async () => {
  const actual = await vi.importActual<typeof import("../../utils")>("../../utils");
  return {
    ...actual,
    authedFetch: authedFetchMock,
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useGetSessions", () => {
  beforeEach(() => {
    useStore.setState({
      site: "",
      privateKey: null,
      filters: [],
      timezone: "Asia/Saigon",
      time: {
        mode: "past-minutes",
        pastMinutesStart: 5,
        pastMinutesEnd: 0,
      },
    });
    authedFetchMock.mockReset();
    authedFetchMock.mockResolvedValue({ data: [] });
  });

  test("does not request sessions when site is empty", async () => {
    renderHook(() => useGetSessions({ page: 1, limit: 25 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(authedFetchMock).not.toHaveBeenCalled();
    });
  });
});
