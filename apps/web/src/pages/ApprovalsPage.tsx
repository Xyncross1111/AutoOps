import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import type { PromotionApprovalSummary } from "@autoops/core";

import { useAppSession } from "../app-context";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, InlineError, LoadingBlock } from "../components/States";
import { approveApproval, listApprovals, rejectApproval } from "../lib/api";
import { formatDateTime, formatRelativeTime, shortSha, titleCase } from "../lib/format";

export function ApprovalsPage() {
  const { token, refreshNonce, refreshApp } = useAppSession();
  const [approvals, setApprovals] = useState<PromotionApprovalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDecisionId, setActiveDecisionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");

    void listApprovals(token, { limit: 100 })
      .then((response) => {
        if (active) {
          setApprovals(response.approvals);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load approvals");
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

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "pending"),
    [approvals]
  );
  const completedApprovals = useMemo(
    () => approvals.filter((approval) => approval.status !== "pending"),
    [approvals]
  );

  async function handleDecision(
    approval: PromotionApprovalSummary,
    decision: "approve" | "reject"
  ) {
    setActiveDecisionId(`${decision}:${approval.id}`);
    setError("");

    try {
      if (decision === "approve") {
        await approveApproval(token, approval.id);
      } else {
        await rejectApproval(token, approval.id);
      }
      refreshApp();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to update approval");
    } finally {
      setActiveDecisionId(null);
    }
  }

  if (isLoading) {
    return <LoadingBlock label="Loading approvals..." />;
  }

  return (
    <div className="ao-page ao-approvals">
      <PageHeader
        eyebrow="Operations / Approvals"
        title="Release approvals"
        description="Review protected release promotions before they queue deployment work."
        meta={
          <div className="ao-inline-meta">
            <span className="ao-chip">{pendingApprovals.length} pending</span>
            <span className="ao-chip">{completedApprovals.length} completed</span>
          </div>
        }
      />

      {error ? <InlineError message={error} /> : null}

      <section className="ao-panel">
        <div className="ao-section-header">
          <div className="ao-section-header__copy">
            <p className="ao-section-header__eyebrow">Queue</p>
            <h2>Pending approvals</h2>
          </div>
          <ClipboardCheck size={18} />
        </div>

        {pendingApprovals.length > 0 ? (
          <div className="ao-ledger">
            {pendingApprovals.map((approval) => (
              <article className="ao-ledger__row ao-approval-row" key={approval.id}>
                <div className="ao-approval-row__body">
                  <strong>
                    {approval.sourceTargetName} to {approval.destinationTargetName}
                  </strong>
                  <div className="ao-ledger__meta">
                    <span>{approval.projectName}</span>
                    <span className="ao-mono">{shortSha(approval.sourceImageDigest)}</span>
                    <span>Requested {formatRelativeTime(approval.createdAt)}</span>
                  </div>
                  <p className="ao-muted">
                    Requested by {approval.requestedBy}. Exact revision {approval.sourceRevisionId.slice(0, 8)}
                    {" "}will be promoted.
                  </p>
                  {approval.requestComment ? (
                    <p className="ao-table__secondary">{approval.requestComment}</p>
                  ) : null}
                </div>

                <div className="ao-approval-row__actions">
                  <StatusBadge status={approval.status} tone="subtle" />
                  <div className="ao-inline-cluster">
                    <button
                      className="ao-button ao-button--primary"
                      disabled={activeDecisionId === `approve:${approval.id}`}
                      onClick={() => void handleDecision(approval, "approve")}
                      type="button"
                    >
                      {activeDecisionId === `approve:${approval.id}` ? "Queueing..." : "Approve"}
                    </button>
                    <button
                      className="ao-button ao-button--secondary"
                      disabled={activeDecisionId === `reject:${approval.id}`}
                      onClick={() => void handleDecision(approval, "reject")}
                      type="button"
                    >
                      {activeDecisionId === `reject:${approval.id}` ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No pending approvals"
            description="Protected promotions waiting for dashboard approval will appear here."
          />
        )}
      </section>

      <section className="ao-panel">
        <div className="ao-section-header">
          <div className="ao-section-header__copy">
            <p className="ao-section-header__eyebrow">Traceability</p>
            <h2>Recent decisions</h2>
          </div>
          <Rocket size={18} />
        </div>

        {completedApprovals.length > 0 ? (
          <div className="ao-ledger">
            {completedApprovals.map((approval) => (
              <article className="ao-ledger__row ao-approval-row" key={approval.id}>
                <div className="ao-approval-row__body">
                  <strong>
                    {approval.sourceTargetName} to {approval.destinationTargetName}
                  </strong>
                  <div className="ao-ledger__meta">
                    <span>{approval.projectName}</span>
                    <span>{titleCase(approval.status)}</span>
                    <span>{formatDateTime(approval.decidedAt ?? approval.createdAt)}</span>
                  </div>
                  <p className="ao-muted">
                    Requested by {approval.requestedBy}
                    {approval.decidedBy ? ` and decided by ${approval.decidedBy}.` : "."}
                  </p>
                  {approval.decisionComment ? (
                    <p className="ao-table__secondary">{approval.decisionComment}</p>
                  ) : null}
                </div>

                <div className="ao-approval-row__actions">
                  <StatusBadge status={approval.status} tone="subtle" />
                  <Link
                    className="ao-link-button ao-link-button--secondary"
                    to={`/deployments?target=${approval.destinationTargetId}`}
                  >
                    Open target
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No completed approvals yet"
            description="Approved and rejected promotion requests will stay visible here for traceability."
          />
        )}
      </section>
    </div>
  );
}
