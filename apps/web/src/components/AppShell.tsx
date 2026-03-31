import {
  Activity,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  RefreshCw,
  Rocket,
  Workflow
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Operational Overview",
    subtitle: "Track platform health, hot spots, and the most important work in motion."
  },
  "/runs": {
    title: "Runs",
    subtitle: "Triage queues, inspect failures, and stream execution detail in one place."
  },
  "/deployments": {
    title: "Deployments",
    subtitle: "Monitor target health, revision history, and rollback readiness."
  },
  "/projects": {
    title: "Projects",
    subtitle: "Manage connected repositories, deployment targets, and setup posture."
  },
  "/projects/new": {
    title: "Register Project",
    subtitle: "Guide a repository from GitHub installation to AutoOps management."
  },
  "/activity": {
    title: "Activity",
    subtitle: "Review audit events and GitHub webhook traffic in a unified feed."
  }
};

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/runs", label: "Runs", icon: Workflow },
  { to: "/deployments", label: "Deployments", icon: Rocket },
  { to: "/projects", label: "Projects", icon: FolderGit2 },
  { to: "/activity", label: "Activity", icon: Activity }
];

export function AppShell(props: {
  userEmail: string;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const location = useLocation();
  const meta = pageMeta[location.pathname] ?? {
    title: "Project Workspace",
    subtitle: "Inspect and manage the selected AutoOps resource."
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">AO</div>
          <div>
            <h1>AutoOps</h1>
            <p>Control Plane</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (
                  `nav-link${isActive ? " active" : ""}`
                )}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <NavLink to="/projects/new" className="sidebar-cta">
          <PlusCircle size={18} />
          <span>New Project</span>
        </NavLink>

        <div className="sidebar-footer">
          <span>Signed in as</span>
          <strong>{props.userEmail}</strong>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div>
            <p className="eyebrow">Premium operations dashboard</p>
            <h2>{meta.title}</h2>
            <p className="header-copy">{meta.subtitle}</p>
          </div>

          <div className="header-actions">
            <button className="secondary" onClick={props.onRefresh}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
            <button className="ghost" onClick={props.onLogout}>
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
