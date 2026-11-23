import { getPlatformSql } from "@/lib/db/client";
import {
  authenticatedDeployContext, authorizedRepositoryForDeployment, controlPlane,
  DeploymentBridgeError, newDeploymentIdempotencyKey, type DeploymentEntry,
  type ProjectList, type WebhookLogEntry,
} from "@/lib/deploy-bridge";
import { checkPlatformRateLimit, isTrustedMutationOrigin, jsonError,
  noStoreHeaders, safePlatformError } from "@/lib/platform-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{id: string}> };

function fail(error: unknown) {
  if (error instanceof DeploymentBridgeError) return jsonError(error.message, error.status);
  const safe = safePlatformError(error);
  return jsonError(safe.message, safe.status);
}

async function ownedProject(request: Request, id: string) {
  const context = await authenticatedDeployContext(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DeploymentBridgeError("Invalid project.", 400);
  const result = await controlPlane<ProjectList>(context.actor, "list");
  const project = result.projects.find(item => item.id === id);
  if (!project) throw new DeploymentBridgeError("Project not found.", 404);
  return { ...context, project, routingReady: result.routingReady };
}

async function loadOwnedWebhookLogs(userId: string, repoId: number): Promise<WebhookLogEntry[]> {
  const sql = getPlatformSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT intake.delivery_id, intake.target, intake.branch, intake.commit_sha,
        intake.dispatch_status, intake.received_at, intake.dispatch_started_at, intake.github_run_id
      FROM aisdk_pro.deployment_intake intake
      JOIN aisdk_pro.deployment_project project ON project.id = intake.project_id
      JOIN aisdk_pro.imported_repository repo ON repo.id = project.repository_id
      WHERE repo.user_id = ${userId} AND repo.github_id = ${repoId}
      ORDER BY intake.received_at DESC
      LIMIT 25
    `;
    return rows.map(row => ({
      deliveryId: String(row.delivery_id),
      target: String(row.target),
      branch: String(row.branch),
      commitSha: String(row.commit_sha),
      dispatchStatus: String(row.dispatch_status),
      receivedAt: String(row.received_at),
      dispatchStartedAt: row.dispatch_started_at == null ? null : String(row.dispatch_started_at),
      githubRunId: row.github_run_id == null ? null : Number(row.github_run_id),
    }));
  } catch {
    return [];
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    const { userId, actor, project } = await ownedProject(request, id);
    if (!checkPlatformRateLimit(String(actor.githubId), "read"))
      return jsonError("Too many requests.", 429);
    const [history, webhookLogs] = await Promise.all([
      controlPlane<{deployments:DeploymentEntry[]}>(actor, "history", { projectId: project.id }),
      loadOwnedWebhookLogs(userId, project.repo_id),
    ]);
    return Response.json({
      deployments: history.deployments,
      webhookLogs,
      webhookVerificationActive: Boolean(process.env.GITHUB_DEPLOY_WEBHOOK_SECRET?.trim()),
      checkedAt: new Date().toISOString(),
    }, { headers: noStoreHeaders() });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  if (!isTrustedMutationOrigin(request)) return jsonError("Invalid request origin.", 403);
  try {
    const { id } = await context.params;
    const { actor, token, project, routingReady } = await ownedProject(request, id);
    if (!routingReady) return jsonError("Deployment routing is not configured.", 503);
    if (!checkPlatformRateLimit(String(actor.githubId), "import"))
      return jsonError("Too many requests.", 429);
    await authorizedRepositoryForDeployment(token, project.repo_full_name);
    const result = await controlPlane<{queued:boolean;deploymentId:string|null}>(actor, "deploy",
      { projectId: project.id, deliveryId: newDeploymentIdempotencyKey() });
    return Response.json(result, { status: result.queued ? 202 : 200, headers: noStoreHeaders() });
  } catch (error) { return fail(error); }
}
