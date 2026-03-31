// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the bootstrap login screen when no token is present", () => {
    render(<App />);

    expect(screen.getByText("AutoOps")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with the bootstrap admin account.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });
});
