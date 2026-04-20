// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  usePathname: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("@/components/auth/use-current-user", () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock("@/components/auth/logout-action", () => ({
  logout: mocks.logout,
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="logout-button" onClick={() => mocks.logout()}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dropdown-trigger">{children}</button>
  ),
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
  }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-item">{children}</div>
  ),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar">{children}</div>
  ),
  AvatarImage: ({ src }: { src: string }) => (
    <img data-testid="avatar-image" src={src} alt="" />
  ),
  AvatarFallback: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="avatar-fallback" className={className}>
      {children}
    </div>
  ),
}));

import { UserButton } from "@/components/auth/user-button";

describe("UserButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/en/dashboard");
    mocks.useCurrentUser.mockReturnValue({
      name: "Test User",
      email: "test@example.com",
      image: "https://example.com/avatar.jpg",
    });
  });

  it("renders the avatar with user image", () => {
    render(<UserButton />);
    const avatarImage = screen.getByTestId("avatar-image");
    expect(avatarImage).toBeInTheDocument();
    expect(avatarImage).toHaveAttribute(
      "src",
      "https://example.com/avatar.jpg"
    );
  });

  it("renders fallback avatar when user has no image", () => {
    mocks.useCurrentUser.mockReturnValue({
      name: "Test User",
      email: "test@example.com",
      image: null,
    });
    render(<UserButton />);
    expect(screen.getByTestId("avatar-fallback")).toBeInTheDocument();
    // The avatar image is present but with an empty src (user.image is null, falls back to "")
    const avatarImage = screen.getByTestId("avatar-image");
    expect(avatarImage).toBeInTheDocument();
  });

  it("renders the logout option with English text", () => {
    render(<UserButton />);
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("renders the logout option with Arabic text on Arabic routes", () => {
    mocks.usePathname.mockReturnValue("/ar/dashboard");
    render(<UserButton />);
    expect(screen.getByText("تسجيل الخروج")).toBeInTheDocument();
  });

  it("renders the dropdown menu structure", () => {
    render(<UserButton />);
    expect(screen.getByTestId("dropdown-menu")).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("dropdown-content")).toBeInTheDocument();
  });

  it("calls logout when logout button is clicked", async () => {
    const user = userEvent.setup();
    render(<UserButton />);
    await user.click(screen.getByTestId("logout-button"));
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("handles undefined user gracefully", () => {
    mocks.useCurrentUser.mockReturnValue(undefined);
    render(<UserButton />);
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
    // With undefined user, user?.image is undefined, falls back to ""
    expect(screen.getByTestId("avatar-image")).toBeInTheDocument();
  });
});
