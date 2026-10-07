import { describe, expect, it } from "vitest";
import {
  dashboardPathForRole,
  isAuthRole,
  isPathForRole,
  isSafeNextPath,
  roleForPath,
  rolePathPrefix,
} from "./routes";

describe("auth route helpers", () => {
  it("maps roles to dashboards", () => {
    expect(dashboardPathForRole("student")).toBe("/student/dashboard");
    expect(dashboardPathForRole("lecturer")).toBe("/lecturer/dashboard");
    expect(dashboardPathForRole("admin")).toBe("/admin/dashboard");
  });

  it("owns role paths", () => {
    expect(roleForPath("/student/dashboard")).toBe("student");
    expect(roleForPath("/lecturer")).toBe("lecturer");
    expect(roleForPath("/admin/users")).toBe("admin");
    expect(roleForPath("/login")).toBeNull();
    expect(roleForPath("/")).toBeNull();
  });

  it("matches paths to roles", () => {
    expect(isPathForRole("/student/calendar", "student")).toBe(true);
    expect(isPathForRole("/admin/dashboard", "student")).toBe(false);
    expect(rolePathPrefix("lecturer")).toBe("/lecturer");
  });

  it("rejects unsafe next paths (open redirects)", () => {
    expect(isSafeNextPath("/student/dashboard")).toBe(true);
    expect(isSafeNextPath("//evil.com")).toBe(false);
    expect(isSafeNextPath("https://evil.com")).toBe(false);
    expect(isSafeNextPath("/a\\b")).toBe(false);
    expect(isSafeNextPath(null)).toBe(false);
    expect(isSafeNextPath("")).toBe(false);
  });

  it("validates role values", () => {
    expect(isAuthRole("admin")).toBe(true);
    expect(isAuthRole("superuser")).toBe(false);
    expect(isAuthRole(undefined)).toBe(false);
  });
});
