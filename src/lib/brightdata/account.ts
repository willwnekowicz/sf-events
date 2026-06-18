// Account-level Bright Data queries used by the cost monitor.

import { getConfig } from "./client";

export interface AccountInfo {
  configured: boolean;
  balance: number | null;
  pendingCosts: number | null;
  status: string | null; // e.g. 'active', 'suspend_manual'
  canMakeRequests: boolean | null;
  customerId: string | null;
  error: string | null;
}

async function getJson(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://api.brightdata.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getAccountInfo(): Promise<AccountInfo> {
  const cfg = getConfig();
  if (!cfg) {
    return {
      configured: false,
      balance: null,
      pendingCosts: null,
      status: null,
      canMakeRequests: null,
      customerId: null,
      error: "Bright Data not configured (BRIGHTDATA_API_TOKEN missing)",
    };
  }
  const [balance, status] = await Promise.all([
    getJson("/customer/balance", cfg.token),
    getJson("/status", cfg.token),
  ]);
  return {
    configured: true,
    balance: typeof balance?.balance === "number" ? (balance.balance as number) : null,
    pendingCosts: typeof balance?.pending_costs === "number" ? (balance.pending_costs as number) : null,
    status: (status?.status as string) ?? null,
    canMakeRequests: (status?.can_make_requests as boolean) ?? null,
    customerId: (status?.customer as string) ?? cfg.customerId,
    error: null,
  };
}
