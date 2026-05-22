import { describe, it, expect, vi } from "vitest";
import { safelySendEmail } from "../safe-send-email.js";

describe("safelySendEmail", () => {
  it("returns ok:true and forwards send fn result on success", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const r = await safelySendEmail(send, { label: "test:ok" });
    expect(r).toEqual({ ok: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it("swallows a throwing send and returns ok:false (no rethrow)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("Resend domain not verified"));
    const r = await safelySendEmail(send, {
      label: "auth:forgot-password",
      userId: "u_1",
      to: "x@example.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r.error as Error).message).toMatch(/Resend/);
    expect(errorSpy).toHaveBeenCalled();
    // The log line carries the label so prod log greps can locate the failure.
    const firstCall = errorSpy.mock.calls[0];
    expect(String(firstCall[0])).toContain("auth:forgot-password");
    errorSpy.mockRestore();
  });

  it("never re-throws even if the send fn throws synchronously", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn(() => {
      throw new Error("sync boom");
    });
    await expect(safelySendEmail(send as () => Promise<void>, { label: "test" })).resolves.toBeDefined();
    errorSpy.mockRestore();
  });
});
