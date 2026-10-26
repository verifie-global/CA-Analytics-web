import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchAnnotationSourceCompanies, fetchAnnotationSources, selectAnnotationSources, type RequestError } from "./api";
import type { AnnotationPage, AnnotationSource, AnnotationSourceCompany, AnnotationSourceFilters } from "./datasetStudioTypes";
import type { AppSettings } from "./types";
import { DatasetSourceCompany } from "./DatasetSourceCompany";
import { formatClipTime } from "./datasetStudioModel";
import { getIntlLocale } from "./i18n";

const MAX_RECORDINGS = 200;
const sourceLabel = (source: AnnotationSource) => `${source.name} (${source.companyName || `Company ${source.companyId}`})`;
const dateBound = (date: string) => {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

type Props = {
  settings: AppSettings;
  signal: AbortSignal;
  selected: Map<number, string>;
  onChange: (selection: Map<number, string>) => void;
  onBusyChange: (busy: boolean) => void;
  onUnauthorized: () => void;
  onForbidden: () => void;
};

export function DatasetRecordingSelection({ settings, signal: accessSignal, selected, onChange, onBusyChange, onUnauthorized, onForbidden }: Props) {
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);
  const [sources, setSources] = useState<AnnotationPage<AnnotationSource> | null>(null);
  const [companies, setCompanies] = useState<AnnotationSourceCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyError, setCompanyError] = useState("");
  const [companyAttempt, setCompanyAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [notice, setNotice] = useState("");
  const pageCheckbox = useRef<HTMLInputElement>(null);
  const selection = useRef(selected);
  selection.current = selected;
  const knownSources = useRef(new Map<number, AnnotationSource>());
  const sourceRequest = useRef<AbortController | null>(null);
  const bulkRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const callbacks = useRef({ onChange, onBusyChange, onUnauthorized, onForbidden });
  callbacks.current = { onChange, onBusyChange, onUnauthorized, onForbidden };
  const dateHelpId = useId();
  const selectionHelpId = useId();
  const filters = useMemo<AnnotationSourceFilters>(() => ({
    q: search.trim(), sourceCompanyId: companyId ? Number(companyId) : null,
    createdFrom: dateBound(createdFrom), createdTo: dateBound(createdTo),
  }), [search, companyId, createdFrom, createdTo]);
  const filterError = (createdFrom && !filters.createdFrom) || (createdTo && !filters.createdTo)
    ? "Enter valid recording dates." : filters.createdFrom && filters.createdTo && filters.createdFrom >= filters.createdTo
      ? "Recorded before must be later than recorded from." : "";
  const filtersKey = JSON.stringify(filters);
  const activeFilters = useRef(filtersKey);
  activeFilters.current = filtersKey;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      bulkRequest.current?.abort();
      bulkRequest.current = null;
    };
  }, [settings.baseUrl, settings.accessToken, accessSignal]);

  const handleAccessError = (reason: unknown) => {
    if ((reason as RequestError).status === 403) { callbacks.current.onForbidden(); return true; }
    if ((reason as RequestError).status === 401) { callbacks.current.onUnauthorized(); return true; }
    return false;
  };

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, accessSignal]);
    setCompaniesLoading(true);
    setCompanyError("");
    if (!signal.aborted) void fetchAnnotationSourceCompanies(settings, signal).then((result) => {
      if (!signal.aborted) setCompanies(result);
    }).catch((reason: unknown) => {
      if (!signal.aborted && !handleAccessError(reason)) setCompanyError(reason instanceof Error ? reason.message : "Unable to load source companies.");
    }).finally(() => { if (!signal.aborted) setCompaniesLoading(false); });
    return () => controller.abort();
  }, [settings.baseUrl, settings.accessToken, accessSignal, companyAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, accessSignal]);
    sourceRequest.current = controller;
    setSourceError("");
    if (filterError) { setLoading(false); setSources(null); return () => controller.abort(); }
    setLoading(true);
    const timer = window.setTimeout(() => {
      if (signal.aborted) return;
      void fetchAnnotationSources(settings, filters, page, signal).then((result) => {
        if (signal.aborted) return;
        result.items.forEach((source) => knownSources.current.set(source.id, source));
        setSources(result);
        const lastPage = Math.max(1, Math.ceil(result.total / (result.pageSize || 50)));
        if (page > lastPage) setPage(lastPage);
      }).catch((reason: unknown) => {
        if (!signal.aborted && !handleAccessError(reason)) setSourceError(reason instanceof Error ? reason.message : "Unable to load recordings.");
      }).finally(() => { if (!signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [settings.baseUrl, settings.accessToken, accessSignal, filters, filterError, page, attempt]);

  const pageItems = sources?.items ?? [];
  const selectedOnPage = pageItems.filter((source) => selected.has(source.id)).length;
  const allOnPage = pageItems.length > 0 && selectedOnPage === pageItems.length;
  const someOnPage = selectedOnPage > 0 && !allOnPage;
  useEffect(() => { if (pageCheckbox.current) pageCheckbox.current.indeterminate = someOnPage; });

  const commit = (next: Map<number, string>) => {
    selection.current = next;
    callbacks.current.onChange(next);
  };
  const cancelBulk = () => {
    bulkRequest.current?.abort();
    bulkRequest.current = null;
    setSelecting(false);
    callbacks.current.onBusyChange(false);
    setSelectionError("");
    setNotice("");
  };
  const changeFilters = (change: () => void) => {
    cancelBulk();
    sourceRequest.current?.abort();
    setPage(1);
    setLoading(true);
    change();
  };
  const changePage = (next: number) => {
    sourceRequest.current?.abort();
    setLoading(true);
    setPage(next);
  };

  const togglePage = () => {
    if (loading || selecting || filterError || sourceError || !pageItems.length) return;
    const next = new Map(selection.current);
    if (allOnPage) pageItems.forEach((source) => next.delete(source.id));
    else {
      const additions = pageItems.filter((source) => !next.has(source.id));
      if (next.size + additions.length > MAX_RECORDINGS) {
        if (pageCheckbox.current) pageCheckbox.current.indeterminate = someOnPage;
        setNotice(`Selecting this page would add ${additions.length} recordings and exceed the 200-recording limit. Your selection was kept. Deselect recordings or clear the selection to make room.`);
        return;
      }
      pageItems.forEach((source) => next.set(source.id, sourceLabel(source)));
    }
    setNotice("");
    setSelectionError("");
    commit(next);
  };

  const selectMatching = async () => {
    const capacity = MAX_RECORDINGS - selection.current.size;
    if (!mounted.current || accessSignal.aborted || filterError || bulkRequest.current || capacity <= 0) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, accessSignal]);
    const requestedFilters = filtersKey;
    bulkRequest.current = controller;
    setSelecting(true);
    callbacks.current.onBusyChange(true);
    setSelectionError("");
    setNotice("");
    try {
      const result = await selectAnnotationSources(settings, {
        ...filters, limit: capacity, excludeConversationIds: [...selection.current.keys()],
      }, signal);
      if (signal.aborted || !mounted.current || bulkRequest.current !== controller || activeFilters.current !== requestedFilters) return;
      const next = new Map(selection.current);
      let added = 0;
      for (const id of result.conversationIds) {
        if (next.has(id) || next.size >= MAX_RECORDINGS) continue;
        const source = knownSources.current.get(id);
        next.set(id, source ? sourceLabel(source) : `Recording #${id}`);
        added++;
      }
      commit(next);
      const didNotFit = Math.max(0, result.totalAvailable - added);
      setNotice(result.truncated
        ? `Added ${added} matching recording${added === 1 ? "" : "s"}. ${didNotFit} additional matching recording${didNotFit === 1 ? "" : "s"} did not fit within the 200-recording limit.`
        : added ? `Added ${added} matching recording${added === 1 ? "" : "s"} across all pages. Existing selections were kept; duplicates were skipped.`
          : "No additional matching recordings to add. Existing selections were kept.");
    } catch (reason) {
      if (signal.aborted || !mounted.current || bulkRequest.current !== controller) return;
      if (!handleAccessError(reason)) setSelectionError(reason instanceof Error ? reason.message : "Unable to select matching recordings. Your selection was kept.");
    } finally {
      if (mounted.current && bulkRequest.current === controller) {
        bulkRequest.current = null;
        setSelecting(false);
        callbacks.current.onBusyChange(false);
      }
    }
  };

  return <div className="dataset-recording-selection">
    <h3>Select recordings</h3>
    <div className="dataset-form-grid dataset-source-filters" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}>
      <label>Search recordings<input type="search" value={search} onChange={(event) => changeFilters(() => setSearch(event.target.value))} placeholder="Search by recording name" /></label>
      <label>Source company<select value={companyId} disabled={companiesLoading || Boolean(companyError)} onChange={(event) => changeFilters(() => setCompanyId(event.target.value))}>
        <option value="">All source companies</option>
        {companies.map((company) => <option data-i18n-skip key={company.id} value={company.id}>{company.name} ({company.recordings} recordings)</option>)}
      </select></label>
      <label>Recorded from (inclusive)<input type="date" value={createdFrom} aria-describedby={dateHelpId} aria-invalid={Boolean(filterError)} onChange={(event) => changeFilters(() => setCreatedFrom(event.target.value))} /></label>
      <label>Recorded before (exclusive)<input type="date" value={createdTo} aria-describedby={dateHelpId} aria-invalid={Boolean(filterError)} onChange={(event) => changeFilters(() => setCreatedTo(event.target.value))} /></label>
    </div>
    <small id={dateHelpId} className="dataset-muted">Dates use your local time. The start date is included; the end date is excluded.</small>
    {filterError && <p className="dataset-error" role="alert">{filterError}</p>}
    {companiesLoading && <p className="dataset-muted" role="status">Loading source companies…</p>}
    {companyError && <div className="form-message error-message" role="alert">{companyError} <button className="secondary-button small-button" type="button" onClick={() => setCompanyAttempt((value) => value + 1)}>Retry source companies</button></div>}
    <div className="dataset-selection-toolbar">
      <strong role="status" aria-live="polite" aria-atomic="true">{selected.size} / 200 selected</strong>
      <div className="dataset-selection-tools">
        <label className="dataset-checkbox dataset-page-selection"><input ref={pageCheckbox} type="checkbox" checked={allOnPage} aria-checked={someOnPage ? "mixed" : allOnPage} disabled={loading || selecting || Boolean(filterError) || Boolean(sourceError) || !pageItems.length} onChange={togglePage} />Select this page</label>
        <button className="secondary-button small-button" type="button" disabled={selecting || Boolean(filterError) || selected.size >= MAX_RECORDINGS} aria-describedby={selectionHelpId} aria-busy={selecting} onClick={() => void selectMatching()}>{selecting ? "Selecting matching recordings…" : `Select matching — up to ${MAX_RECORDINGS - selected.size}`}</button>
        <button className="secondary-button small-button" type="button" disabled={!selected.size && !selecting} onClick={() => { cancelBulk(); commit(new Map()); }}>Clear selection</button>
      </div>
    </div>
    <small id={selectionHelpId} className="dataset-muted">Select matching adds the newest matching recordings across all pages, up to the remaining capacity. Transcription starts only with Create &amp; transcribe.</small>
    {selected.size === MAX_RECORDINGS && <p className="dataset-warning">Selection is full. Deselect recordings or clear the selection to make room.</p>}
    {notice && <p className="dataset-notice" role="status">{notice}</p>}
    {selectionError && <div className="form-message error-message" role="alert">{selectionError} <button type="button" className="secondary-button small-button" disabled={selecting || Boolean(filterError) || selected.size >= MAX_RECORDINGS} onClick={() => void selectMatching()}>Retry matching selection</button></div>}
    {selected.size > 0 && <details className="dataset-selected"><summary>Selected recordings ({selected.size})</summary>
      <div className="dataset-selection-list">{[...selected].map(([id, title]) => <button data-i18n-skip className="secondary-button small-button" key={id} type="button" disabled={selecting} aria-label={`Remove ${knownSources.current.has(id) ? sourceLabel(knownSources.current.get(id)!) : title}`} onClick={() => { const next = new Map(selection.current); next.delete(id); commit(next); setNotice(""); }}>{knownSources.current.has(id) ? sourceLabel(knownSources.current.get(id)!) : title} ×</button>)}</div>
    </details>}
    {sourceError && <div className="form-message error-message" role="alert">{sourceError} <button type="button" className="secondary-button small-button" onClick={() => setAttempt((value) => value + 1)}>Retry recordings</button></div>}
    <div className="dataset-source-list" aria-label="Matching recordings" aria-busy={loading}>
      {loading ? <p className="empty-state" role="status">Loading recordings…</p> : !sourceError && !filterError && !sources?.items.length ? <div className="empty-state"><h3>No recordings found</h3><p>Try other filters or upload audio through the existing upload flow.</p></div> : !sourceError && !filterError && pageItems.map((source) => <label className="dataset-source" key={source.id}>
        <input data-i18n-skip type="checkbox" aria-label={source.name} checked={selected.has(source.id)} disabled={selecting || (selected.size >= MAX_RECORDINGS && !selected.has(source.id))} onChange={(event) => {
          const next = new Map(selection.current);
          if (event.target.checked && next.size < MAX_RECORDINGS) next.set(source.id, sourceLabel(source)); else next.delete(source.id);
          commit(next); setNotice(""); setSelectionError("");
        }} />
        <span><strong data-i18n-skip>{source.name}</strong><DatasetSourceCompany companyId={source.companyId} companyName={source.companyName} /><small>{new Date(source.createdAt).toLocaleString(getIntlLocale())} · {source.durationSeconds === null ? "Duration unavailable" : formatClipTime(source.durationSeconds)}</small></span>
      </label>)}
    </div>
    <div className="dataset-pagination" aria-label="Recording pages">
      <button className="secondary-button small-button" type="button" disabled={loading || Boolean(filterError) || page <= 1} onClick={() => changePage(page - 1)}>Previous recordings</button>
      <span>Page {page} of {Math.max(1, Math.ceil((sources?.total ?? 0) / (sources?.pageSize || 50)))} · {sources?.total ?? 0} recordings</span>
      <button className="secondary-button small-button" type="button" disabled={loading || Boolean(filterError) || Boolean(sourceError) || !sources || page * sources.pageSize >= sources.total} onClick={() => changePage(page + 1)}>Next recordings</button>
    </div>
  </div>;
}
