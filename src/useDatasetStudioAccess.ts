import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDatasetStudioIdentity } from "./api";
import type { AppSettings } from "./types";
import { clearDatasetWorkspace, createDatasetWorkspace, type DatasetWorkspace } from "./datasetStudioTypes";

type Access = {
  scope: string;
  status: "loading" | "allowed" | "denied";
  workspace: DatasetWorkspace;
};

export function useDatasetStudioAccess(settings: AppSettings, authenticated: boolean, onUnauthorized: () => void) {
  // The editable company context has no part in this check or its cache key.
  const scope = JSON.stringify([settings.baseUrl, settings.accessToken, settings.userId ?? null]);
  const [access, setAccess] = useState<Access | null>(null);
  const current = useRef<Access | null>(null);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    if (!authenticated || !settings.accessToken) return;
    const next: Access = { scope, status: "loading", workspace: createDatasetWorkspace() };
    current.current = next;
    setAccess(next);
    const signal = next.workspace.controller.signal;
    void fetchDatasetStudioIdentity(settings, signal).then((identity) => {
      if (signal.aborted) return;
      const status = identity.companyId === "1" ? "allowed" : "denied";
      if (status === "denied") clearDatasetWorkspace(next.workspace);
      const resolved: Access = { ...next, status };
      current.current = resolved;
      setAccess(resolved);
    }).catch((error: unknown) => {
      if (signal.aborted) return;
      clearDatasetWorkspace(next.workspace);
      const denied: Access = { ...next, status: "denied" };
      current.current = denied;
      setAccess(denied);
      if ((error as { status?: number }).status === 401) unauthorized.current();
    });
    return () => {
      clearDatasetWorkspace(next.workspace);
      if (current.current?.workspace === next.workspace) current.current = null;
    };
  }, [authenticated, settings.baseUrl, settings.accessToken, scope]);

  const revoke = useCallback(() => {
    const active = current.current;
    if (!active || active.scope !== scope) return;
    clearDatasetWorkspace(active.workspace);
    const denied: Access = { ...active, status: "denied" };
    current.current = denied;
    setAccess(denied);
  }, [scope]);

  const matches = authenticated && access?.scope === scope;
  return {
    status: matches ? access.status : "loading" as const,
    workspace: matches ? access.workspace : null,
    revoke,
  };
}
