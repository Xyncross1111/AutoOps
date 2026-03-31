import { useDeferredValue, useEffect, useState } from "react";
import { ArrowRight, FolderPlus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProjectSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { listProjects } from "../lib/api";
import { formatDateTime } from "../lib/format";

export function ProjectsPage() {
  const { token, refreshNonce } = useAppSession();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="page-stack">
      {error ? <InlineError message={error} /> : null}

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Portfolio</p>
            <h3>Connected projects</h3>
          </div>
          <Link className="button-link" to="/projects/new">
            <FolderPlus size={16} />
            <span>Register Project</span>
          </Link>
        </div>

        <label className="toolbar-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, owner, repo, or branch"
          />
        </label>
      </section>

      {filteredProjects.length > 0 ? (
        <section className="project-card-grid">
          {filteredProjects.map((project) => (
            <Link className="project-card" key={project.id} to={`/projects/${project.id}`}>
              <div className="row-spread">
                <strong>{project.name}</strong>
                <StatusBadge status={project.latestRunStatus ?? "idle"} tone="subtle" />
              </div>
              <p>
                {project.repoOwner}/{project.repoName}
              </p>
              <div className="project-meta-row">
                <span>Branch: {project.defaultBranch}</span>
                <span>Targets: {project.targetCount}</span>
              </div>
              <small>Updated {formatDateTime(project.updatedAt)}</small>
              <span className="text-link">
                Open workspace <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No projects match the current search"
          description="Try another search term or register a new repository."
          action={
            <Link className="button-link" to="/projects/new">
              Register Project
            </Link>
          }
        />
      )}
    </div>
  );
}
