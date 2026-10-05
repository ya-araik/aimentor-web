import { beforeEach } from "vitest";

Object.defineProperty(window, "matchMedia", { writable: true, value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }) });
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Object.defineProperty(document, "fonts", { value: new EventTarget() });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
