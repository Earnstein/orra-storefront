import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  isInitialized: vi.fn(() => false),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock("@sentry/nextjs", () => sentry);
const after = vi.hoisted(() => vi.fn((task: () => unknown) => void task()));
vi.mock("next/server", () => ({ after }));

const { reportError, reportMessage } = await import("./report");

beforeEach(() => vi.clearAllMocks());

describe("reportError and reportMessage", () => {
  it("send nothing while monitoring is off", () => {
    reportError(new Error("boom"));
    reportMessage("Demo reset had failed steps", { failedSteps: ["photos"] });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("send to Sentry and flush once the response is done", () => {
    sentry.isInitialized.mockReturnValue(true);
    const error = new Error("boom");
    reportError(error, { tags: { source: "window" } });
    reportMessage("Demo reset had failed steps", { failedSteps: ["photos"] });
    expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { source: "window" } });
    expect(sentry.captureMessage).toHaveBeenCalledWith("Demo reset had failed steps", { level: "error", extra: { failedSteps: ["photos"] } });
    expect(after).toHaveBeenCalledTimes(2);
    expect(sentry.flush).toHaveBeenCalledTimes(2);
  });

  it("still sends outside a request, where after() throws", () => {
    sentry.isInitialized.mockReturnValue(true);
    after.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });
    expect(() => reportError(new Error("boom"))).not.toThrow();
    expect(sentry.captureException).toHaveBeenCalledOnce();
  });
});
