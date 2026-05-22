import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement layout APIs used by the onboarding tour + dnd-kit
// (`scrollIntoView` and the typed return of `getBoundingClientRect`). Provide
// no-op stubs so components that call these during render don't throw.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {
    /* jsdom no-op */
  };
}

// vitest config has `globals: false`, which disables RTL's auto-cleanup that
// normally fires on `globalThis.afterEach`. Without this, renders from one
// test stay mounted in the next, so queries like `getByPlaceholderText` can
// match elements from a previous test and fail with multiple-match errors.
afterEach(() => {
  cleanup();
});
