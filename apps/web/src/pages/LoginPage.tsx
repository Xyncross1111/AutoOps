import { FormEvent, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FolderGit2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
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
    <div className="ao-login">
      <div className="ao-login__frame">
        <aside className="ao-panel ao-login__aside">
          <div className="ao-login__brand">
            <div className="ao-sidebar__brand-mark">AO</div>
            <strong>AutoOps</strong>
          </div>

          <div className="ao-login__lede">
            <p className="ao-page-header__eyebrow">Welcome</p>
            <h1>Ship reliable pipelines from day one.</h1>
            <p className="ao-muted">
              AutoOps gives operators a clean control plane for GitHub workflows,
              environment-aware deployments, and rapid rollback when things go sideways.
            </p>
          </div>

          <div className="ao-login__stats ao-panel ao-panel--inset">
            <dl>
              <div>
                <dt>Use case</dt>
                <dd>Automated deployments, run visibility, release approvals</dd>
              </div>
              <div>
                <dt>Target users</dt>
                <dd>Platform teams, operations crews, and self-hosted projects</dd>
              </div>
              <div>
                <dt>Default setup</dt>
                <dd>Quick start in under 10 minutes</dd>
              </div>
            </dl>
          </div>

          <div className="ao-panel ao-panel--inset ao-login__steps">
            <p className="ao-section-header__eyebrow">Get started in 3 steps</p>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Sign in or create account</strong>
                  <p>Use a simple email and password to unlock the workspace.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Connect GitHub repositories</strong>
                  <p>Import projects and map your target environments.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Monitor, approve, and recover</strong>
                  <p>Track live runs, approvals, and rollback safely.</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="ao-login__bullets">
            <div className="ao-panel ao-panel--inset ao-login__bullet">
              <FolderGit2 size={16} />
              <div>
                <strong>Connect GitHub</strong>
                <p>Discover the repositories your account can access.</p>
              </div>
            </div>
            <div className="ao-panel ao-panel--inset ao-login__bullet">
              <Rocket size={16} />
              <div>
                <strong>Deploy and roll back</strong>
                <p>Manage revisions, targets, and recovery actions from the dashboard.</p>
              </div>
            </div>
            <div className="ao-panel ao-panel--inset ao-login__bullet">
              <TerminalSquare size={16} />
              <div>
                <strong>Inspect live logs</strong>
                <p>Follow runs and deployments with readable streaming output.</p>
              </div>
            </div>
          </div>

          <div className="ao-inline-meta">
            <span className="ao-chip"><ShieldCheck size={14} /> Production-safe workflow</span>
            <span className="ao-chip"><CheckCircle2 size={14} /> Role-ready by design</span>
            <span className="ao-chip"><Rocket size={14} /> Fast onboarding</span>
          </div>
        </aside>

        <form className="ao-panel ao-login__card" onSubmit={handleSubmit}>
          <div className="ao-stack ao-stack--sm">
            <p className="ao-page-header__eyebrow">Account</p>
            <h2>
              {mode === "login" ? "Sign in to your workspace" : "Create your AutoOps account"}
            </h2>
            <p className="ao-muted">
              {mode === "login"
                ? "Use your AutoOps credentials to access your repositories, projects, and deployment history."
                : "Create a user account for this AutoOps instance. GitHub is connected after you sign in."}
            </p>
          </div>

          <div className="ao-login__tabs">
            <button
              type="button"
              className={`ao-button ${
                mode === "login" ? "ao-button--primary" : "ao-button--secondary"
              }`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`ao-button ${
                mode === "register" ? "ao-button--primary" : "ao-button--secondary"
              }`}
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

          <button className="ao-button ao-button--primary ao-login__submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "login"
                ? "Signing In..."
                : "Creating Account..."
              : mode === "login"
                ? "Enter Control Plane"
                : "Create Account"}
          </button>

          {error ? <InlineError message={error} /> : null}

          <div className="ao-inline-meta ao-muted">
            <LockKeyhole size={14} />
            <span>
              Want an account? Switch to <strong>Create Account</strong>. GitHub connections live in Repositories.
            </span>
          </div>

          <button
            className="ao-link-button ao-link-button--secondary"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            type="button"
          >
            {mode === "login" ? (
              <>
                Explore onboarding for new teams <ArrowRight size={14} />
              </>
            ) : (
              <>
                Go back to sign-in <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
