# AutoOps Results Figures

The screenshots in this folder were generated from the actual AutoOps dashboard UI using mock operational data aligned with the project workflow.

Recommended figure inserts:

1. `activity-webhook-log.png`
Caption: `Fig. 5. Webhook event capture and HMAC signature validation recorded in the AutoOps activity timeline.`

2. `runs-failed-run-log.png`
Caption: `Fig. 6. Failed pipeline run showing deterministic stage execution, dependency audit feedback, and remediation-oriented log output.`

3. `deployments-revision-ledger.png`
Caption: `Fig. 7. Deployment revision ledger with rollback readiness and controlled promotion from preview to production.`

4. `approvals-release-queue.png`
Caption: `Fig. 8. Protected release approval queue used to supervise production promotion requests.`

5. `overview-dashboard.png`
Caption: `Fig. 9. Centralized AutoOps overview dashboard summarizing active runs, failed runs, unhealthy targets, approvals, and recent activity.`

Important note:

The current repository does not expose a dedicated vulnerability severity dashboard with categories such as critical, high, and medium. If you want the paper to stay accurate to the implemented project, replace that description with one of the figures above, especially the run-log or activity screenshots. If you still want a severity-classification figure, it should be labeled as a conceptual mockup rather than an implemented dashboard.
