import { FormEvent, useState } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { InlineError } from "../components/States";
import { login } from "../lib/api";

export function LoginPage(props: {
  onAuthenticated: (token: string, email: string) => void;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setIsSubmitting(true);
    setError("");

    try {
      const response = await login(
        String(form.get("email") ?? ""),
        String(form.get("password") ?? "")
      );
      props.onAuthenticated(response.token, response.user.email);
      navigate("/", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Login failed.");
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
          <p className="eyebrow">Bootstrap access</p>
          <h2>Sign in to AutoOps</h2>
          <p className="muted-copy">
            Use the bootstrap admin account configured on this server.
          </p>

          <label>
            <span>Email</span>
            <input
              required
              name="email"
              type="email"
              placeholder="admin@autoops.local"
              defaultValue="admin@autoops.local"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              required
              name="password"
              type="password"
              placeholder="Enter your password"
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing In..." : "Enter Control Plane"}
          </button>

          {error ? <InlineError message={error} /> : null}
        </div>
      </form>
    </div>
  );
}
