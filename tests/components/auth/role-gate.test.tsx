// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({
  useCurrentRole: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("@/components/auth/use-current-role", () => ({
  useCurrentRole: mocks.useCurrentRole,
}));

vi.mock("@/components/auth/error/form-error", () => ({
  FormError: ({ message }: { message?: string }) =>
    message ? <div data-testid="form-error">{message}</div> : null,
}));

import { RoleGate } from "@/components/auth/role-gate";

describe("RoleGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/en/dashboard");
  });

  it("renders children when user has the allowed role", () => {
    mocks.useCurrentRole.mockReturnValue("ADMIN");
    render(
      <RoleGate allowedRole="ADMIN">
        <div data-testid="protected-content">Admin Content</div>
      </RoleGate>
    );
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("shows error message when user does not have the allowed role", () => {
    mocks.useCurrentRole.mockReturnValue("USER");
    render(
      <RoleGate allowedRole="ADMIN">
        <div data-testid="protected-content">Admin Content</div>
      </RoleGate>
    );
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-error")).toHaveTextContent(
      "You do not have permission to view this content!"
    );
  });

  it("shows Arabic error message on Arabic routes", () => {
    mocks.usePathname.mockReturnValue("/ar/dashboard");
    mocks.useCurrentRole.mockReturnValue("USER");
    render(
      <RoleGate allowedRole="ADMIN">
        <div>Admin Content</div>
      </RoleGate>
    );
    expect(screen.getByTestId("form-error")).toHaveTextContent(
      "ليس لديك صلاحية لعرض هذا المحتوى!"
    );
  });

  it("shows error when user role is undefined", () => {
    mocks.useCurrentRole.mockReturnValue(undefined);
    render(
      <RoleGate allowedRole="ADMIN">
        <div data-testid="protected-content">Admin Content</div>
      </RoleGate>
    );
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("form-error")).toBeInTheDocument();
  });

  it("renders children for non-ADMIN roles when that role is allowed", () => {
    mocks.useCurrentRole.mockReturnValue("MANAGER");
    render(
      <RoleGate allowedRole="MANAGER">
        <div data-testid="manager-content">Manager Content</div>
      </RoleGate>
    );
    expect(screen.getByTestId("manager-content")).toBeInTheDocument();
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });
});
