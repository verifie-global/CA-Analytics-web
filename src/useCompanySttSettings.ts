import { useEffect, useMemo, useRef, useState } from "react";
import { fetchCompanySttSettings, saveCompanySttSettings } from "./api";
import type { RequestError } from "./api";
import type { AppSettings, CompanySttSettings, CompanySttSettingsUpdate } from "./types";

type SettingsState = {
  value: CompanySttSettings | null;
  loading: boolean;
  saving: boolean;
  forbidden: boolean;
  errorMessage: string;
  successMessage: string;
};

const emptyState: SettingsState = {
  value: null,
  loading: false,
  saving: false,
  forbidden: false,
  errorMessage: "",
  successMessage: "",
};

export function useCompanySttSettings(
  settings: AppSettings,
  enabled: boolean,
  pageOpen: boolean,
  onUnauthorized: () => void,
) {
  const { baseUrl, companyId, accessToken } = settings;
  // A new scope also distinguishes switching away and back to the same company.
  const scope = useMemo(
    () => ({ baseUrl, companyId, accessToken, apiToken: "", enabled }),
    [baseUrl, companyId, accessToken, enabled],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  const requestId = useRef(0);
  const loadedScope = useRef<typeof scope | null>(null);
  const inFlightSave = useRef<{ scope: typeof scope } | null>(null);
  const [state, setState] = useState<SettingsState & { scope: typeof scope }>(
    () => ({ ...emptyState, scope, loading: enabled }),
  );

  useEffect(() => () => {
    ++requestId.current;
    loadedScope.current = null;
  }, [scope]);

  useEffect(() => {
    // Prefetch defaults for uploads, then refresh on opening the settings page.
    // Leaving the page must not discard a save still pending for this company.
    if (loadedScope.current === scope && (!pageOpen || inFlightSave.current?.scope === scope)) return;
    loadedScope.current = scope;
    const id = ++requestId.current;
    const isCurrent = () => currentScope.current === scope && requestId.current === id;
    setState((previous) => ({
      ...emptyState,
      scope,
      value: enabled && previous.scope === scope ? previous.value : null,
      loading: enabled,
    }));

    if (enabled) {
      void fetchCompanySttSettings(scope).then(
        (value) => {
          if (isCurrent()) setState({ ...emptyState, scope, value });
        },
        (error: unknown) => {
          if (!isCurrent()) return;
          const status = (error as RequestError | null)?.status;
          if (status === 401) {
            unauthorized.current();
          } else {
            setState((previous) => ({
              ...previous,
              loading: false,
              forbidden: status === 403,
              errorMessage: status === 403
                ? "Your account is not allowed to manage STT settings."
                : error instanceof Error ? error.message : "Unable to load STT settings.",
            }));
          }
        },
      );
    }
  }, [scope, enabled, pageOpen]);

  const save = async (update: CompanySttSettingsUpdate) => {
    if (
      !enabled || currentScope.current !== scope || state.scope !== scope ||
      !state.value || state.loading || state.saving || state.forbidden ||
      inFlightSave.current?.scope === scope
    ) return;
    const id = ++requestId.current;
    const operation = { scope };
    inFlightSave.current = operation;
    const isCurrent = () => currentScope.current === scope && requestId.current === id;
    setState((previous) => ({ ...previous, saving: true, errorMessage: "", successMessage: "" }));

    try {
      const value = await saveCompanySttSettings(scope, update);
      if (isCurrent()) {
        setState({ ...emptyState, scope, value, successMessage: "STT settings saved successfully." });
      }
    } catch (error) {
      if (isCurrent()) {
        const status = (error as RequestError | null)?.status;
        if (status === 401) {
          unauthorized.current();
        } else {
          setState((previous) => ({
            ...previous,
            saving: false,
            forbidden: status === 403,
            errorMessage: status === 403
              ? "Your account is not allowed to manage STT settings."
              : error instanceof Error ? error.message : "Unable to save STT settings.",
          }));
        }
      }
      throw error;
    } finally {
      if (inFlightSave.current === operation) inFlightSave.current = null;
    }
  };

  // Never expose another company's cached values, even before effects run.
  return {
    ...(state.scope === scope ? state : { ...emptyState, loading: enabled }),
    save,
  };
}
