import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAppSession } from "../app-context";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, LoadingBlock } from "../components/States";
import { completeGitHubOAuth, syncGitHubInstallation } from "../lib/api";

export function GitHubConnectCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, refreshApp } = useAppSession();
  const [error, setError] = useState("");

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const installationId = Number(searchParams.get("installation_id") ?? "");
  const callbackError = searchParams.get("error");
  const callbackErrorDescription = searchParams.get("error_description");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    if (callbackError) {
      setError(callbackErrorDescription ?? callbackError);
      return;
    }

    let active = true;

    if (code && state) {
      void completeGitHubOAuth(token, { code, state })
        .then(() => {
          if (!active) {
            return;
          }
          refreshApp();
          navigate("/repositories?oauth=connected", { replace: true });
        })
        .catch((caughtError) => {
          if (active) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Failed to finish the GitHub OAuth flow."
            );
          }
        });
    } else if (Number.isInteger(installationId) && installationId > 0) {
      void syncGitHubInstallation(token, installationId)
        .then(() => {
          if (!active) {
            return;
          }
          refreshApp();
          navigate(`/repositories?connected=1&installationId=${installationId}`, {
            replace: true
          });
        })
        .catch((caughtError) => {
          if (active) {
            setError(
              caughtError instanceof Error
                ? caughtError.message
                : "Failed to finish the GitHub App installation flow."
            );
          }
        });
    } else {
      setError("GitHub did not return an authorization code or installation id.");
    }

    return () => {
      active = false;
    };
  }, [
    callbackError,
    callbackErrorDescription,
    code,
    installationId,
    navigate,
    refreshApp,
    state,
    token
  ]);

  if (!token) {
    return <LoadingBlock label="Redirecting to login..." />;
  }

  if (error) {
    return (
      <div className="ao-page">
        <PageHeader
          eyebrow="Integrations / Callback"
          title="GitHub connection did not complete"
          description={error}
        />
        <EmptyState
          title="Connection failed"
          description="Review the message above, then return to the repository console and try again."
          action={
            <Link className="ao-link-button ao-link-button--primary" to="/repositories">
              Back to repositories
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="ao-page">
      <PageHeader
        eyebrow="Integrations / Callback"
        title="Finishing GitHub connection"
        description="AutoOps is finalizing the GitHub handshake and refreshing the repository console."
      />
      <div className="ao-inline-message">
        <strong>GitHub is connected</strong>
        <span>AutoOps is loading the latest repository data now.</span>
      </div>
      <LoadingBlock label="Finishing GitHub connection..." />
    </div>
  );
}
