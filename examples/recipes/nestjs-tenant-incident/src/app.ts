/**
 * Minimal NestJS DI surface for the paired tenant incident.
 * Store keys are opaque recipe refs — not production tenant names.
 */
import "reflect-metadata";

import { Injectable, Module } from "@nestjs/common";

import { TENANT_ALPHA, TENANT_BETA } from "./refs.js";

export type Policy = {
  policyId: string;
  tenantRef: string;
  text: string;
};

const STORE: Record<string, Policy> = {
  [TENANT_ALPHA]: {
    policyId: "pol-alpha",
    tenantRef: TENANT_ALPHA,
    text: "Refund window is 30 days.",
  },
  [TENANT_BETA]: {
    policyId: "pol-beta",
    tenantRef: TENANT_BETA,
    text: "Refund window is 7 days.",
  },
};

@Injectable()
export class PolicyService {
  async retrieve(tenantRef: string): Promise<Policy> {
    const policy = STORE[tenantRef];
    if (!policy) throw new Error(`no policy for ${tenantRef}`);
    return policy;
  }
}

export type AskResult = {
  answer: string;
  policyId: string;
  policyTenantRef: string;
  requestedTenantRef: string;
  resultRef: string;
};

@Injectable()
export class SupportService {
  constructor(private readonly policies: PolicyService) {}

  /**
   * @param bindTenantRef when set, deliberately joins another tenant's policy
   *   (broken variant). Omit for correct binding.
   */
  async ask(
    requestedTenantRef: string,
    question: string,
    bindTenantRef?: string,
    resultRef = "rref-unset",
  ): Promise<AskResult> {
    const lookupTenant = bindTenantRef ?? requestedTenantRef;
    const policy = await this.policies.retrieve(lookupTenant);
    return {
      answer: `${question} → ${policy.text}`,
      policyId: policy.policyId,
      policyTenantRef: policy.tenantRef,
      requestedTenantRef,
      resultRef,
    };
  }
}

@Module({
  providers: [PolicyService, SupportService],
  exports: [SupportService, PolicyService],
})
export class SupportModule {}
