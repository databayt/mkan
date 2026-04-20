// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  login: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/auth/login/action", () => ({
  login: mocks.login,
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("@/components/auth/social", () => ({
  Social: ({ callbackUrl }: { callbackUrl?: string }) => (
    <div data-testid="social-login" data-callback={callbackUrl}>
      Social Login Buttons
    </div>
  ),
}));

vi.mock("@/components/auth/error/form-error", () => ({
  FormError: ({ message }: { message?: string }) =>
    message ? <div data-testid="form-error">{message}</div> : null,
}));

vi.mock("@/components/auth/form-success", () => ({
  FormSuccess: ({ message }: { message?: string }) =>
    message ? <div data-testid="form-success">{message}</div> : null,
}));

import { LoginForm } from "@/components/auth/login/form";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/en/login");
    mocks.login.mockResolvedValue({});
  });

  it("renders email and password input fields", () => {
    render(<LoginForm />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("renders the welcome heading", () => {
    render(<LoginForm />);
    expect(screen.getByText("Welcome to Mkan")).toBeInTheDocument();
  });

  it("renders the continue submit button", () => {
    render(<LoginForm />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("type", "submit");
  });

  it("renders social login section", () => {
    render(<LoginForm />);
    expect(screen.getByTestId("social-login")).toBeInTheDocument();
  });

  it("renders forgot password and sign up links", () => {
    render(<LoginForm />);
    const forgotLink = screen.getByText("Forget your password");
    const signUpLink = screen.getByText("Don't have an account");
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink.closest("a")).toHaveAttribute("href", "/reset");
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink.closest("a")).toHaveAttribute("href", "/join");
  });

  it("displays Arabic translations when pathname starts with /ar", () => {
    mocks.usePathname.mockReturnValue("/ar/login");
    render(<LoginForm />);
    expect(
      screen.getByText((_, el) => el?.textContent === "مرحبا بك في مكان")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("البريد الإلكتروني")
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("كلمة المرور")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "متابعة" })
    ).toBeInTheDocument();
  });

  it("shows url error when error prop is provided", () => {
    render(<LoginForm error="OAuthAccountNotLinked" />);
    expect(screen.getByTestId("form-error")).toHaveTextContent(
      "OAuthAccountNotLinked"
    );
  });

  it("calls login action on valid form submission", async () => {
    const user = userEvent.setup();
    mocks.login.mockResolvedValue({ success: "Login successful" });

    render(<LoginForm />);
    await user.type(screen.getByPlaceholderText("Email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          password: "password123",
        }),
        undefined
      );
    });
  });
});
