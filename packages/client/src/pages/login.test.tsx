import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Login from "./login";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  usePasswordResetAvailability: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: mocks.signInEmail,
    },
  },
}));

vi.mock("@/hooks/use-password-reset-availability", () => ({
  usePasswordResetAvailability: mocks.usePasswordResetAvailability,
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login page", () => {
  beforeEach(() => {
    mocks.usePasswordResetAvailability.mockReturnValue(false);
  });

  it("uses login autofill metadata for email and password fields", () => {
    renderLogin();

    expect(screen.getByLabelText("邮箱")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("密码")).toHaveAttribute("autocomplete", "current-password");
  });

  it("uses form errors instead of native validation for empty credentials", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();

    expect(container.querySelector("form")).toHaveAttribute("novalidate");

    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByText("请输入邮箱")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("密码")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });
});
