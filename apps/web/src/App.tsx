import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppSessionContext } from "./app-context";
import { AppShell } from "./components/AppShell";
import { getAuthMe, getGitHubAccount, listGitHubInstallations } from "./lib/api";
import { ActivityPage } from "./pages/ActivityPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { GitHubConnectCallbackPage } from "./pages/GitHubConnectCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { RunsPage } from "./pages/RunsPage";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("autoops-token") ?? "");
  const [userEmail, setUserEmail] = useState(() => (
    localStorage.getItem("autoops-email") ?? ""
  ));
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const savedTheme = localStorage.getItem("autoops-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    return "light";
  });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [githubConnectionState, setGitHubConnectionState] = useState<
    "unknown" | "connected" | "disconnected"
  >(() => (token ? "unknown" : "disconnected"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("autoops-token", token);
    } else {
      localStorage.removeItem("autoops-token");
    }
  }, [token]);

  useEffect(() => {
    if (userEmail) {
      localStorage.setItem("autoops-email", userEmail);
    } else {
      localStorage.removeItem("autoops-email");
    }
  }, [userEmail]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("autoops-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!token) {
      setGitHubConnectionState("disconnected");
      return;
    }

    let active = true;
    void getAuthMe(token)
      .then((response) => {
        if (active) {
          setUserEmail(response.user.email);
        }
      })
      .catch(() => {
        if (active) {
          handleLogout();
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setGitHubConnectionState("disconnected");
      return;
    }

    let active = true;
    setGitHubConnectionState("unknown");

    void Promise.allSettled([getGitHubAccount(token), listGitHubInstallations(token)])
      .then(([accountResult, installationsResult]) => {
        if (!active) {
          return;
        }

        const hasOAuthConnection =
          accountResult.status === "fulfilled" && Boolean(accountResult.value.account);
        const hasInstallationConnection =
          installationsResult.status === "fulfilled" &&
          installationsResult.value.installations.length > 0;

        setGitHubConnectionState(
          hasOAuthConnection || hasInstallationConnection ? "connected" : "disconnected"
        );
      })
      .catch(() => {
        if (active) {
          setGitHubConnectionState("disconnected");
        }
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, token]);

  function handleAuthenticated(nextToken: string, email: string) {
    setToken(nextToken);
    setUserEmail(email);
  }

  function handleLogout() {
    setToken("");
    setUserEmail("");
  }

  function refreshApp() {
    setRefreshNonce((current) => current + 1);
  }

  function handleThemeToggle() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  return (
    <AppSessionContext.Provider
      value={{
        token,
        userEmail,
        refreshNonce,
        setUserEmail,
        refreshApp,
        logout: handleLogout
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              token
                ? <Navigate replace to="/" />
                : <LoginPage onAuthenticated={handleAuthenticated} />
            }
          />

          <Route
            path="/"
            element={
              token ? (
                <AppShell
                  userEmail={userEmail || "Loading..."}
                  theme={theme}
                  onRefresh={refreshApp}
                  onLogout={handleLogout}
                  onToggleTheme={handleThemeToggle}
                  showGitHubConnect={githubConnectionState === "disconnected"}
                />
              ) : (
                <LoginPage onAuthenticated={handleAuthenticated} />
              )
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="github/connect/callback" element={<GitHubConnectCallbackPage />} />
            <Route path="repositories" element={<RepositoriesPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/new" element={<NewProjectPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="activity" element={<ActivityPage />} />
          </Route>

          <Route path="*" element={<Navigate replace to={token ? "/" : "/login"} />} />
        </Routes>
      </BrowserRouter>
    </AppSessionContext.Provider>
  );
}
