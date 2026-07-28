// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QaScoreBadge } from "./QaScoreBadge";

afterEach(cleanup);

describe("QaScoreBadge", () => {
  it("shows the configured maximum instead of QA possible points", () => {
    render(<QaScoreBadge score={105} maximumScore={120} />);

    expect(screen.getByText("105 / 120")).toBeTruthy();
    expect(screen.queryByText(/1350/)).toBeNull();
  });

  it("renders negative scores without clamping", () => {
    render(<QaScoreBadge score={-30} maximumScore={120} />);

    expect(screen.getByText("-30 / 120")).toBeTruthy();
  });
});
