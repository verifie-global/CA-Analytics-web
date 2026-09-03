import { describe, expect, it } from "vitest";
import { getRouteFromPath } from "./App";

describe("STT settings navigation", () => {
  it("keeps the former STT settings URL on the QA settings screen", () => {
    expect(getRouteFromPath("/admin/stt-settings")).toBe("qa-profile");
    expect(getRouteFromPath("/settings/qa-profile")).toBe("qa-profile");
  });
});
