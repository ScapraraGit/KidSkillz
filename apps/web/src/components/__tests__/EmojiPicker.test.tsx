import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmojiPicker } from "../EmojiPicker";
import { TooltipProvider } from "../Tooltip";

// Tooltip uses Radix which needs a provider; wrap once per render to avoid
// the "TooltipProvider missing" runtime warning.
function renderPicker(props: { value: string; onChange: (e: string) => void; label?: string }) {
  return render(
    <TooltipProvider>
      <EmojiPicker {...props} />
    </TooltipProvider>,
  );
}

describe("EmojiPicker", () => {
  it("renders the current value on the trigger button", () => {
    renderPicker({ value: "🎨", onChange: () => {} });
    const trigger = screen.getByLabelText(/pick an icon/i);
    expect(trigger.textContent).toBe("🎨");
  });

  it("falls back to ❓ when value is empty", () => {
    renderPicker({ value: "", onChange: () => {} });
    expect(screen.getByLabelText(/pick an icon/i).textContent).toBe("❓");
  });

  it("opens the grid when the trigger is clicked", () => {
    renderPicker({ value: "⭐", onChange: () => {} });
    fireEvent.click(screen.getByLabelText(/pick an icon/i));
    // Header inside the open popover.
    expect(screen.getByText(/choose an icon/i)).toBeInTheDocument();
  });

  it("calls onChange with the selected emoji and closes the popover", () => {
    const onChange = vi.fn();
    renderPicker({ value: "⭐", onChange });
    fireEvent.click(screen.getByLabelText(/pick an icon/i));
    // Pick a known preset by its accessibility label.
    fireEvent.click(screen.getByLabelText("Use 🎨"));
    expect(onChange).toHaveBeenCalledWith("🎨");
    // Popover closed → header gone.
    expect(screen.queryByText(/choose an icon/i)).not.toBeInTheDocument();
  });

  it("accepts a custom paste via the text input + Use button", () => {
    const onChange = vi.fn();
    renderPicker({ value: "⭐", onChange });
    fireEvent.click(screen.getByLabelText(/pick an icon/i));
    const input = screen.getByPlaceholderText(/e\.g\. 🦄/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "🦄" } });
    fireEvent.click(screen.getByText(/^Use$/i));
    expect(onChange).toHaveBeenCalledWith("🦄");
  });

  it("ignores empty custom input", () => {
    const onChange = vi.fn();
    renderPicker({ value: "⭐", onChange });
    fireEvent.click(screen.getByLabelText(/pick an icon/i));
    const useBtn = screen.getByText(/^Use$/i) as HTMLButtonElement;
    expect(useBtn.disabled).toBe(true);
  });

  it("uses a custom aria label when provided", () => {
    renderPicker({ value: "⭐", onChange: () => {}, label: "Pick category icon" });
    expect(screen.getByLabelText("Pick category icon")).toBeInTheDocument();
  });
});
