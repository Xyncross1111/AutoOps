import {
  Activity,
  ClipboardCheck,
  FolderGit2,
  LayoutDashboard,
  Menu,
  LogOut,
  Moon,
  Plus,
  PlusCircle,
  RefreshCw,
  Rocket,
  Sun,
  Workflow
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { BrandLogo } from "./BrandLogo";

const pageMeta: Record<string, { title: string; section: string }> = {
  "/": {
    title: "Overview",
    section: "Platform"
  },
  "/runs": {
    title: "Runs",
    section: "Operations"
  },
  "/deployments": {
    title: "Deployments",
    section: "Operations"
  },
  "/approvals": {
    title: "Approvals",
    section: "Operations"
  },
  "/github/connect/callback": {
    title: "GitHub Connection",
    section: "Integrations"
  },
  "/repositories": {
    title: "Repositories",
    section: "Inventory"
  },
  "/projects": {
    title: "Projects",
    section: "Inventory"
  },
  "/projects/new": {
    title: "New Project",
    section: "Inventory"
  },
  "/activity": {
    title: "Activity",
    section: "Audit"
  }
};

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/repositories", label: "Repositories", icon: FolderGit2 },
  { to: "/projects", label: "Projects", icon: FolderGit2 },
  { to: "/runs", label: "Runs", icon: Workflow },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/activity", label: "Activity", icon: Activity }
];

export function AppShell(props: {
  userEmail: string;
  theme: "light" | "dark";
  onRefresh: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  showGitHubConnect: boolean;
}) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const meta = pageMeta[location.pathname] ?? {
    title: location.pathname.startsWith("/projects/")
      ? "Project"
      : location.pathname.startsWith("/runs")
        ? "Runs"
        : location.pathname.startsWith("/approvals")
          ? "Approvals"
        : "Workspace",
    section: location.pathname.startsWith("/projects/")
      ? "Inventory"
      : location.pathname.startsWith("/runs")
        ? "Operations"
        : location.pathname.startsWith("/approvals")
          ? "Operations"
        : "AutoOps"
  };

  return (
    <div className="ao-shell">
      {isSidebarOpen ? (
        <button
          aria-label="Close navigation"
          className="ao-sidebar__backdrop"
          type="button"
          onClick={() => setIsSidebarOpen(false)}
        />
      ) : null}

      <aside className={`ao-sidebar${isSidebarOpen ? " is-open" : ""}`}>
        <div className="ao-sidebar__brand">
          <BrandLogo className="ao-sidebar__brand-mark" title="AutoOps" />
          <div>
            <h1>AutoOps</h1>
            <p>Control plane</p>
          </div>
        </div>

        <nav className="ao-sidebar__nav" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `ao-sidebar__nav-link${isActive ? " is-active" : ""}`
                }
                onClick={() => setIsSidebarOpen(false)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="ao-sidebar__footer">
          <NavLink
            className="ao-link-button ao-link-button--primary"
            to="/projects/new"
            onClick={() => setIsSidebarOpen(false)}
          >
            <Plus size={16} />
            <span>New Project</span>
          </NavLink>

          <div className="ao-sidebar__user">
            <p>Signed in as</p>
            <strong>{props.userEmail}</strong>
          </div>

          <div className="ao-sidebar__actions">
            <button className="ao-sidebar__footer-link" onClick={props.onToggleTheme}>
              {props.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              <span>{props.theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
            <button className="ao-sidebar__footer-link" onClick={props.onLogout}>
              <LogOut size={16} />
              <span>Log out</span>
            </button>
            {props.showGitHubConnect ? (
              <NavLink
                className="ao-sidebar__footer-link"
                onClick={() => setIsSidebarOpen(false)}
                to="/repositories"
              >
                <PlusCircle size={16} />
                <span>Connect GitHub</span>
              </NavLink>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="ao-shell__main">
        <header className="ao-topbar">
          <div className="ao-topbar__left">
            <button
              aria-label="Open navigation"
              className="ao-button ao-button--secondary ao-topbar__menu"
              onClick={() => setIsSidebarOpen(true)}
              type="button"
            >
              <Menu size={16} />
            </button>
            <div className="ao-topbar__crumb">
              <span>{meta.section}</span>
              <span>/</span>
              <strong>{meta.title}</strong>
            </div>
          </div>

          <div className="ao-topbar__right">
            <button className="ao-button ao-button--secondary" onClick={props.onRefresh}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
            <NavLink className="ao-link-button ao-link-button--secondary" to="/repositories">
              <FolderGit2 size={16} />
              <span>Repositories</span>
            </NavLink>
          </div>
        </header>

        <main className="ao-shell__page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
