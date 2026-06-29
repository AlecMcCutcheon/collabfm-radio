import { isAdminSession } from "./setup.js";
import { verifyBroadcastDeviceFromRequest } from "../db/broadcastDevices.js";
import {
  evaluateBroadcastContent,
  logContentPolicyDecision,
  normalizePolicy,
  shouldDeferContentPolicyEnforcement,
} from "../content/contentPolicy.js";
import {
  getContentPolicySettings,
  saveContentPolicySettings,
  resetContentPolicySettings,
} from "../settings/contentPolicy.js";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function evaluateRequestBody(body) {
  const policy = getContentPolicySettings();
  const decision = evaluateBroadcastContent(
    {
      source: body.source ?? body.site ?? null,
      artist: body.artist ?? null,
      title: body.title ?? null,
      licenseType: body.licenseType ?? null,
      licenseUrl: body.licenseUrl ?? null,
    },
    policy,
  );
  return { policy, decision };
}

export {
  CONTENT_POLICY_MUTED_TITLE,
  CONTENT_POLICY_MUTED_ARTIST,
  isContentPolicyMutedMetadata,
  shouldDeferContentPolicyEnforcement,
} from "../content/contentPolicy.js";

export async function handleContentPolicyRoutes(req, res, pathname, method) {
  if (pathname === "/api/admin/content-policy" && method === "GET") {
    if (!isAdminSession(req)) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    json(res, 200, {
      policy: getContentPolicySettings(),
    });
    return true;
  }

  if (pathname === "/api/admin/content-policy" && method === "PUT") {
    if (!isAdminSession(req)) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    try {
      const body = await readBody(req);
      if (body.resetDefaults === true) {
        const policy = resetContentPolicySettings();
        json(res, 200, { ok: true, policy });
        return true;
      }
      const policy = saveContentPolicySettings(body.policy ?? body);
      json(res, 200, { ok: true, policy });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  if (pathname === "/api/content-policy/evaluate" && method === "POST") {
    const device = verifyBroadcastDeviceFromRequest(req);
    if (!device) {
      json(res, 401, { error: "Unauthorized" });
      return true;
    }
    try {
      const body = await readBody(req);
      const { decision } = evaluateRequestBody(body);
      logContentPolicyDecision(decision, {
        userId: device.userId,
        broadcasterName: body.broadcasterName || null,
      });
      json(res, 200, { decision });
      return true;
    } catch {
      json(res, 400, { error: "Invalid request" });
      return true;
    }
  }

  return false;
}

/** Server-side gate for metadata posts (and similar). Returns decision or null if allowed/warn. */
export function enforceContentPolicyForBroadcast(input, context = {}) {
  const policy = getContentPolicySettings();
  const decision = evaluateBroadcastContent(input, policy);
  logContentPolicyDecision(decision, context);
  return decision;
}

export function resolveContentPolicyForBroadcast(input, context = {}) {
  const policy = getContentPolicySettings();
  const decision = evaluateBroadcastContent(input, policy);
  logContentPolicyDecision(decision, context);
  const deferred = shouldDeferContentPolicyEnforcement(decision, input, policy);
  const muted = decision.action === "deny" && !deferred;
  return { policy, decision, deferred, muted };
}

export { normalizePolicy };
