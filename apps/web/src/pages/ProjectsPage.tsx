import { useDeferredValue, useEffect, useState } from "react";
import { ExternalLink, FolderPlus, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ProjectSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Toolbar } from "../components/Toolbar";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { listProjects } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { formatManagedModeLabel } from "../lib/managed-app";
import { formatExternalUrlLabel, normalizeExternalUrl } from "../lib/links";

export function ProjectsPage() {
  const { token, refreshNonce } = useAppSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const search = searchParams.get("search") ?? "";
  const modeFilter = searchParams.get("mode") ?? "all";
  const frameworkFilter = searchParams.get("framework") ?? "all";
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void listProjects(token)
      .then((response) => {
        if (active) {
          setProjects(response.projects);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load projects");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshNonce, token]);

  const filteredProjects = projects.filter((project) => {
    if (modeFilter === "managed" && project.mode !== "managed_nextjs") {
      return false;
    }

    if (modeFilter === "custom" && project.mode !== "custom_pipeline") {
      return false;
    }

    if (frameworkFilter !== "all") {
      const projectFramework =
        project.managedConfig?.framework === "react_cra"
          ? "react"
          : project.managedConfig?.framework ?? "unknown";
      if (projectFramework !== frameworkFilter) {
        return false;
      }
    }

    if (!deferredSearch) {
      return true;
    }

    return [
      project.name,
      project.repoOwner,
      project.repoName,
      project.defaultBranch
    ]
      .join(" ")
      .toLowerCase()
      .includes(deferredSearch);
  });

  if (isLoading) {
    return <LoadingBlock label="Loading projects..." />;
  }

  function updateParams(nextValues: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (!value || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });

    setSearchParams(next, { replace: true });
  }

  return (
    <div className="ao-page">
      <PageHeader
        eyebrow="Inventory / Portfolio"
        title="Projects"
        description="Track imported and custom pipeline projects, their current run health, and live entrypoints."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{projects.length} total projects</span>
            <span className="ao-chip">{filteredProjects.length} visible</span>
          </div>
        }
        actions={
          <Link className="ao-link-button ao-link-button--primary" to="/projects/new">
            <FolderPlus size={16} />
            <span>New project</span>
          </Link>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section className="ao-panel">
        <Toolbar sticky>
          <label className="ao-search-input">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => updateParams({ search: event.target.value })}
              placeholder="Search by name, owner, repo, or branch"
            />
          </label>

          <select value={modeFilter} onChange={(event) => updateParams({ mode: event.target.value })}>
            <option value="all">All modes</option>
            <option value="managed">Managed</option>
            <option value="custom">Custom pipeline</option>
          </select>

          <select
            value={frameworkFilter}
            onChange={(event) => updateParams({ framework: event.target.value })}
          >
            <option value="all">All frameworks</option>
            <option value="nextjs">Next.js</option>
            <option value="nuxt">Nuxt</option>
            <option value="express">Express</option>
            <option value="nestjs">NestJS</option>
            <option value="react">React</option>
            <option value="vue">Vue</option>
            <option value="astro">Astro</option>
            <option value="static_html">HTML</option>
            <option value="unknown">Unknown</option>
          </select>

          <div className="ao-toolbar__spacer" />

          <Link className="ao-link-button ao-link-button--secondary" to="/repositories">
            Open repositories
          </Link>
        </Toolbar>
      </section>

      {filteredProjects.length > 0 ? (
        <section className="ao-panel ao-projects-table">
          <div className="ao-table-wrap">
            <table className="ao-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Mode</th>
                  <th>Framework</th>
                  <th>Branch</th>
                  <th>Targets</th>
                  <th>Latest run</th>
                  <th>Live URL</th>
                  <th>Updated</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                    <td>
                      <div className="ao-table__primary">
                        <strong>{project.name}</strong>
                        <span className="ao-table__secondary">
                          {project.repoOwner}/{project.repoName}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`ao-chip${project.mode === "managed_nextjs" ? " ao-chip--accent" : ""}`}>
                        {project.mode === "managed_nextjs" ? "Managed" : "Custom pipeline"}
                      </span>
                    </td>
                    <td>
                      <span className="ao-chip">
                        {project.managedConfig?.framework
                          ? formatManagedModeLabel(project.managedConfig.framework).replace(/^Managed\s+/, "")
                          : "Unknown"}
                      </span>
                    </td>
                    <td className="ao-mono">{project.defaultBranch}</td>
                    <td>{project.targetCount}</td>
                    <td>
                      <StatusBadge status={project.latestRunStatus ?? "idle"} tone="subtle" />
                    </td>
                    <td>
                      {project.primaryUrl ? (
                        <a
                          className="ao-project-link"
                          href={normalizeExternalUrl(project.primaryUrl) ?? project.primaryUrl}
                          onClick={(event) => event.stopPropagation()}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink size={14} />
                          <span>{formatExternalUrlLabel(project.primaryUrl)}</span>
                        </a>
                      ) : (
                        <span className="ao-table__secondary">Not deployed</span>
                      )}
                    </td>
                    <td className="ao-mono">{formatDateTime(project.updatedAt)}</td>
                    <td>
                      <Link
                        className="ao-link-button ao-link-button--secondary"
                        onClick={(event) => event.stopPropagation()}
                        to={`/projects/${project.id}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects imported yet"
          description="Import a managed app from the repository console or register a custom pipeline project."
          action={
            <div className="ao-inline-cluster">
              <Link className="ao-link-button ao-link-button--primary" to="/repositories">
                Open repositories
              </Link>
              <Link className="ao-link-button ao-link-button--secondary" to="/projects/new">
                New custom project
              </Link>
            </div>
          }
        />
      ) : (
        <EmptyState
          title="No projects match the current filters"
          description="Try another search term or clear the mode/framework filters."
          action={
            <button
              className="ao-button ao-button--secondary"
              type="button"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            >
              Clear filters
            </button>
          }
        />
      )}
    </div>
  );
}
