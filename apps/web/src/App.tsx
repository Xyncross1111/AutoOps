import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppSessionContext } from "./app-context";
import { AppShell } from "./components/AppShell";
import { getAuthMe } from "./lib/api";
import { ActivityPage } from "./pages/ActivityPage";
import { DeploymentsPage } from "./pages/DeploymentsPage";
import { LoginPage } from "./pages/LoginPage";
import { NewProjectPage } from "./pages/NewProjectPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RunsPage } from "./pages/RunsPage";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("autoops-token") ?? "");
  const [userEmail, setUserEmail] = useState(() => (
    localStorage.getItem("autoops-email") ?? ""
  ));
  const [refreshNonce, setRefreshNonce] = useState(0);

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
    if (!token) {
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
                  onRefresh={refreshApp}
                  onLogout={handleLogout}
                />
              ) : (
                <Navigate replace to="/login" />
              )
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="runs" element={<RunsPage />} />
            <Route path="deployments" element={<DeploymentsPage />} />
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
