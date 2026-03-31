import { FormEvent, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InlineError } from "../components/States";
import { login, register } from "../lib/api";

export function LoginPage(props: {
  onAuthenticated: (token: string, email: string) => void;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setIsSubmitting(true);
    setError("");

    try {
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const response =
        mode === "login"
          ? await login(email, password)
          : await register(email, password);
      props.onAuthenticated(response.token, response.user.email);
      navigate("/", { replace: true });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : mode === "login"
            ? "Login failed."
            : "Account creation failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-hero">
        <p className="eyebrow">Self-hosted CI/CD, elevated</p>
        <h1>AutoOps feels like a premium control room now.</h1>
        <p>
          Monitor delivery posture, investigate failures, and manage deployment operations
          from a calmer, sharper interface.
        </p>
        <div className="login-feature-list">
          <div className="feature-pill">
            <Sparkles size={16} />
            <span>Executive overview</span>
          </div>
          <div className="feature-pill">
            <LockKeyhole size={16} />
            <span>Protected operator workspace</span>
          </div>
        </div>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="card-frame">
          <p className="eyebrow">Operator access</p>
          <h2>{mode === "login" ? "Sign in to AutoOps" : "Create your AutoOps account"}</h2>
          <p className="muted-copy">
            {mode === "login"
              ? "Sign in with your AutoOps account to access your projects and connected GitHub workspace."
              : "Create a personal AutoOps login, then connect your own GitHub account and import repositories."}
          </p>

          <div className="auth-mode-toggle">
            <button
              type="button"
              className={mode === "login" ? "secondary" : "ghost"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={mode === "register" ? "secondary" : "ghost"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          <label>
            <span>Email</span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              required
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              placeholder={mode === "login" ? "Enter your password" : "Choose a password"}
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Signing In..."
                : "Creating Account..."
              : mode === "login"
                ? "Enter Control Plane"
                : "Create Account"}
          </button>

          {error ? <InlineError message={error} /> : null}
        </div>
      </form>
    </div>
  );
}
