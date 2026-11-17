import { describe, expect, it } from "vitest";
import { getRouteFromPath } from "./App";

describe("STT settings navigation", () => {
  it("opens Processing Settings from both former STT settings links", () => {
    expect(getRouteFromPath("/admin/stt-settings")).toBe("processing-settings");
    expect(getRouteFromPath("/settings/qa-profile", "#company-stt-settings")).toBe("processing-settings");
    expect(getRouteFromPath("/settings/qa-profile")).toBe("qa-profile");
  });
});
