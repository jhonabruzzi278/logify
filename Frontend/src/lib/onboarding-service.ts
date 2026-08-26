import { apiFetch } from "@/lib/api-client";
import type { ApiOnboarding } from "@/types/api";

export interface CompleteOnboardingInput {
  name: string;
  contactEmail: string;
  businessCountry: string;
  businessIndustry: string;
  businessPhone: string;
  usedPosBefore: boolean;
  goals: string[];
}

export function getOnboarding(): Promise<ApiOnboarding> {
  return apiFetch<ApiOnboarding>("/api/onboarding");
}

export function completeOnboarding(input: CompleteOnboardingInput): Promise<ApiOnboarding> {
  return apiFetch<ApiOnboarding>("/api/onboarding", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
