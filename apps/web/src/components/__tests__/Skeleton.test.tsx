import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonCard } from "../ui";

describe("Skeleton", () => {
  it("renders with animate-pulse and bg-slate-200", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-slate-200");
  });

  it("merges extra className", () => {
    const { container } = render(<Skeleton className="h-10 w-1/2" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-10");
    expect(el.className).toContain("w-1/2");
    expect(el.className).toContain("animate-pulse");
  });

  it("has aria-hidden so screen readers skip it", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("SkeletonCard", () => {
  it("renders 3 skeleton lines by default", () => {
    const { container } = render(<SkeletonCard />);
    // Each line is a Skeleton div with animate-pulse
    const lines = container.querySelectorAll("[aria-hidden='true']");
    expect(lines).toHaveLength(3);
  });

  it("renders the requested number of lines", () => {
    const { container } = render(<SkeletonCard lines={5} />);
    const lines = container.querySelectorAll("[aria-hidden='true']");
    expect(lines).toHaveLength(5);
  });

  it("renders 1 line", () => {
    const { container } = render(<SkeletonCard lines={1} />);
    const lines = container.querySelectorAll("[aria-hidden='true']");
    expect(lines).toHaveLength(1);
  });

  it("accepts className on the card wrapper", () => {
    const { container } = render(<SkeletonCard className="my-custom" />);
    expect((container.firstChild as HTMLElement).className).toContain("my-custom");
  });
});
