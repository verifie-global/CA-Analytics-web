// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QaApplicabilityControl } from "./QaApplicabilityControl";
import { QaScoreBadge } from "./QaScoreBadge";
import type { QaResult } from "./types";

afterEach(cleanup);

describe("QaApplicabilityControl", () => {
  it("requires a trimmed reason and submits the valid trimmed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => undefined);
    render(
      <QaApplicabilityControl
        qa={{ isApplicable: true, status: "completed", score: 88 }}
        isCompleted
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark as not applicable for QA" }));
    const submit = screen.getByRole("button", { name: "Mark as not applicable" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const reasonInput = screen.getByLabelText("Reason") as HTMLTextAreaElement;
    expect(reasonInput.maxLength).toBe(512);
    await user.type(reasonInput, "   ");
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.clear(reasonInput);
    await user.type(reasonInput, "  Internal test call  ");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(false, "Internal test call"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirms restoration and submits without a reason", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => undefined);
    render(
      <QaApplicabilityControl
        qa={{ isApplicable: false, status: "not_applicable", score: null }}
        isCompleted
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark as applicable for QA" }));
    expect(screen.getByText(/QA status will become pending/i)).toBeTruthy();
    expect(screen.getByText(/previous score will not be restored/i)).toBeTruthy();
    expect(screen.getByText(/recalculation is required/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mark as applicable" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true, undefined));
  });

  it("preserves the reason and shows validation or access errors returned by the server", async () => {
    const user = userEvent.setup();
    const onChange = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("A reason is required when marking a conversation as not applicable for QA."), {
          status: 400,
        }),
      )
      .mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));
    render(
      <QaApplicabilityControl
        qa={{ isApplicable: true }}
        isCompleted
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark as not applicable for QA" }));
    const reason = screen.getByLabelText("Reason");
    await user.type(reason, "Internal test call");
    await user.click(screen.getByRole("button", { name: "Mark as not applicable" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "A reason is required when marking a conversation as not applicable for QA.",
    );
    expect((reason as HTMLTextAreaElement).value).toBe("Internal test call");

    await user.click(screen.getByRole("button", { name: "Mark as not applicable" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Call not found or you do not have access.",
    );
    expect((reason as HTMLTextAreaElement).value).toBe("Internal test call");
  });

  it("shows loading and prevents duplicate submissions", async () => {
    const user = userEvent.setup();
    let resolveRequest!: () => void;
    const onChange = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    render(
      <QaApplicabilityControl
        qa={{ isApplicable: false, status: "not_applicable" }}
        isCompleted
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Mark as applicable for QA" }));
    const submit = screen.getByRole("button", { name: "Mark as applicable" });
    await user.dblClick(submit);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "Updating..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolveRequest();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("updates the visible action and pending score after a successful cache/state replacement", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [qa, setQa] = useState<QaResult>({
        isApplicable: false,
        status: "not_applicable",
        score: null,
        notApplicableReason: "Internal test call",
      });
      return (
        <>
          <QaApplicabilityControl
            qa={qa}
            isCompleted
            onChange={async () =>
              setQa({
                isApplicable: true,
                status: "pending",
                score: null,
                notApplicableReason: null,
              })
            }
          />
          <QaScoreBadge
            score={qa.score}
            status={qa.status}
            isApplicable={qa.isApplicable}
            notApplicableReason={qa.notApplicableReason}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByText("QA not applicable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mark as applicable for QA" }));
    await user.click(screen.getByRole("button", { name: "Mark as applicable" }));

    expect(await screen.findByText("Pending QA recalculation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark as not applicable for QA" })).toBeTruthy();
    expect(screen.queryByText("88.00%")).toBeNull();
  });
});
