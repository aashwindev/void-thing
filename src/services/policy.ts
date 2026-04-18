import type { ActionRequest, PolicyRecord } from "../domain/types.js";

export interface PolicyDecision {
  effect: "allow" | "deny" | "require_approval";
  reason?: string;
  policy?: PolicyRecord;
}

const matchesConditions = (request: ActionRequest, policy: PolicyRecord): boolean => {
  const conditions = policy.condition_json;
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  if (typeof conditions.strategy === "string") {
    const strategy = request.params?.strategy;
    if (strategy !== conditions.strategy) {
      return false;
    }
  }

  if (Array.isArray(conditions.domain_suffix_in)) {
    const domain = String(request.params?.domain ?? "");
    const matches = conditions.domain_suffix_in.some((suffix) =>
      typeof suffix === "string" ? domain.endsWith(suffix) : false
    );
    if (!matches) {
      return false;
    }
  }

  return true;
};

export const evaluatePolicies = (request: ActionRequest, policies: PolicyRecord[]): PolicyDecision => {
  const matched = policies.filter(
    (policy) =>
      policy.tool === request.tool &&
      (!policy.environment || policy.environment === request.environment) &&
      matchesConditions(request, policy)
  );

  const deny = matched.find((policy) => policy.effect === "deny");
  if (deny) {
    return {
      effect: "deny",
      reason: `Blocked by policy: ${deny.name}`,
      policy: deny
    };
  }

  const requireApproval = matched.find((policy) => policy.effect === "require_approval");
  if (requireApproval) {
    return {
      effect: "require_approval",
      reason: `Approval required by policy: ${requireApproval.name}`,
      policy: requireApproval
    };
  }

  return { effect: "allow" };
};
