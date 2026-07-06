import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { fetchCallSummaryReport } from "./api";
import type { AppSettings, CallSummaryReport, QaQuestion } from "./types";

type DateRange = {
  from: string;
  to: string;
};

const SENTIMENTS = ["positive", "neutral", "negative"] as const;
const EM_DASH = "—";

const toUtcInputValue = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}`;

const getInitialRange = (): DateRange => {
  const to = new Date();
  to.setUTCSeconds(0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: toUtcInputValue(from), to: toUtcInputValue(to) };
};

const utcInputToIso = (value: string) => {
  const parsed = new Date(`${value}:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const formatPercent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? EM_DASH : `${value.toFixed(2)}%`;

const formatCount = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);

const formatDuration = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value) || value < 0) return EM_DASH;

  const totalMinutes = Math.floor(value / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return `${Math.floor(value)}s`;
};

const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "The report could not be loaded.";
  try {
    const parsed = JSON.parse(error.message) as { message?: string; title?: string };
    return parsed.message || parsed.title || error.message;
  } catch {
    return error.message || "The report could not be loaded.";
  }
};

function QaQuestionCard({ question, tone }: {
  question: QaQuestion;
  tone: "weakest" | "passed" | "failed";
}) {
  return (
    <article className={`agent-qa-question agent-qa-question-${tone}`}>
      <div className="agent-qa-question-heading">
        <span className="agent-qa-indicator" aria-hidden="true" />
        <strong>{question.title}</strong>
        <span>{formatPercent(question.averageScorePercentage)}</span>
      </div>
      <dl className="agent-qa-metrics">
        <div><dt>Evaluated</dt><dd>{formatCount(question.evaluatedCount)}</dd></div>
        <div><dt>Passed</dt><dd>{formatCount(question.passedCount)}</dd></div>
        <div><dt>Failed</dt><dd>{formatCount(question.failedCount)}</dd></div>
      </dl>
    </article>
  );
}

export function CallSummaryReportPage({
  settings,
  onUnauthorized,
}: {
  settings: AppSettings;
  onUnauthorized: () => void;
}) {
  const [range, setRange] = useState<DateRange>(getInitialRange);
  const [report, setReport] = useState<CallSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(() => new Set());
  const requestId = useRef(0);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  const loadReport = useCallback(
    async (nextRange: DateRange) => {
      const createdFromUtc = utcInputToIso(nextRange.from);
      const createdToUtc = utcInputToIso(nextRange.to);

      if (!createdFromUtc || !createdToUtc) {
        setError("Choose both UTC date and time values.");
        setReport(null);
        return;
      }
      if (createdFromUtc > createdToUtc) {
        setError("The start of the range must be before the end.");
        setReport(null);
        return;
      }

      const currentRequest = ++requestId.current;
      setLoading(true);
      setError("");
      try {
        const result = await fetchCallSummaryReport(settings, createdFromUtc, createdToUtc);
        if (currentRequest === requestId.current) setReport(result);
      } catch (requestError) {
        if (currentRequest !== requestId.current) return;
        if (
          requestError &&
          typeof requestError === "object" &&
          "status" in requestError &&
          (requestError as { status?: number }).status === 401
        ) {
          onUnauthorizedRef.current();
          return;
        }
        setReport(null);
        setError(getErrorMessage(requestError));
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [settings],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport(range), 450);
    return () => window.clearTimeout(timer);
  }, [range, loadReport]);

  const handleApply = (event: FormEvent) => {
    event.preventDefault();
    void loadReport(range);
  };

  const toggleAgent = (agentKey: string) => {
    setExpandedAgents((current) => {
      const next = new Set(current);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });
  };

  const sentimentByName = new Map(report?.sentiments.map((item) => [item.sentiment, item]));

  return (
    <section className="report-page">
      <div className="report-heading">
        <div className="section-heading">
          <p className="eyebrow">Reporting</p>
          <h2>Call summary</h2>
          <p>Company-wide call, sentiment, and agent QA performance.</p>
        </div>
        <form className="report-range" onSubmit={handleApply}>
          <label>
            From (UTC)
            <input
              type="datetime-local"
              value={range.from}
              onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="datetime-local"
              value={range.to}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </button>
        </form>
      </div>

      {error ? (
        <div className="report-state report-error" role="alert">
          <strong>Unable to load report</strong>
          <p>{error}</p>
          <button type="button" className="secondary-button small-button" onClick={() => void loadReport(range)}>
            Try again
          </button>
        </div>
      ) : loading && !report ? (
        <div className="report-state" aria-live="polite">
          <span className="report-spinner" aria-hidden="true" />
          <strong>Loading call summary…</strong>
        </div>
      ) : report && report.totalCalls === 0 ? (
        <div className="report-state">
          <strong>No calls in this range</strong>
          <p>Choose a wider UTC date range and try again.</p>
        </div>
      ) : report ? (
        <div className={loading ? "report-content report-content-loading" : "report-content"}>
          <div className="report-summary-grid">
            <article><span>Total calls</span><strong>{formatCount(report.totalCalls)}</strong></article>
            <article><span>Total calls duration</span><strong>{formatDuration(report.totalDurationSeconds)}</strong></article>
            <article><span>Average QA score</span><strong>{formatPercent(report.averageQaScore)}</strong></article>
            <article><span>QA-scored calls</span><strong>{formatCount(report.qaScoredCallCount)}</strong></article>
            <article><span>Unknown sentiment calls</span><strong>{formatCount(report.unknownSentimentCount)}</strong></article>
          </div>

          <section className="report-card">
            <div className="report-card-heading">
              <div><h3>Sentiment distribution</h3><p>Share of calls with a recognized sentiment.</p></div>
            </div>
            <div className="sentiment-report-grid">
              {SENTIMENTS.map((sentiment) => {
                const item = sentimentByName.get(sentiment);
                const percentage = item?.percentage ?? 0;
                return (
                  <article key={sentiment} className={`sentiment-report-item sentiment-report-${sentiment}`}>
                    <div><span>{sentiment}</span><strong>{formatPercent(percentage)}</strong></div>
                    <div className="sentiment-progress" aria-label={`${sentiment}: ${formatPercent(percentage)}`}>
                      <span style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} />
                    </div>
                    <small>{formatCount(item?.count ?? 0)} calls</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="report-card">
            <div className="report-card-heading">
              <div><h3>Agent performance</h3><p>Call volume and the weakest QA question for each agent.</p></div>
              <span>{formatCount(report.agents.length)} agents</span>
            </div>
            {report.agents.length === 0 ? (
              <div className="report-table-empty">No agent data is available for this range.</div>
            ) : (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead><tr>
                    <th>Agent</th><th>External ID</th><th>Phone</th><th>Total calls</th>
                    <th>QA-scored</th><th>Avg. QA</th><th>Weakest QA question</th>
                    <th>Pass / fail</th><th>Avg. question score</th><th>QA details</th>
                  </tr></thead>
                  <tbody>
                    {report.agents.map((agent) => {
                      const isExpanded = expandedAgents.has(agent.agentKey);
                      const passedQuestions = agent.passedQuestions ?? [];
                      const notPassedQuestions = [...(agent.notPassedQuestions ?? [])].sort(
                        (left, right) => left.averageScorePercentage - right.averageScorePercentage,
                      );

                      return (
                        <Fragment key={agent.agentKey}>
                          <tr className={isExpanded ? "agent-summary-row is-expanded" : "agent-summary-row"}>
                            <td data-label="Agent"><strong>{agent.agentName?.trim() || EM_DASH}</strong></td>
                            <td data-label="External ID">{agent.agentExternalId?.trim() || EM_DASH}</td>
                            <td data-label="Phone">{agent.agentPhone?.trim() || EM_DASH}</td>
                            <td data-label="Total calls">{formatCount(agent.callCount)}</td>
                            <td data-label="QA-scored">{formatCount(agent.qaScoredCallCount)}</td>
                            <td data-label="Avg. QA">{formatPercent(agent.averageQaScore)}</td>
                            <td data-label="Weakest QA question">
                              {agent.weakestQuestion ? (
                                <span className="question-cell">
                                  <strong>{agent.weakestQuestion.title}</strong>
                                  <small>{formatCount(agent.weakestQuestion.evaluatedCount)} evaluated</small>
                                </span>
                              ) : EM_DASH}
                            </td>
                            <td data-label="Pass / fail">
                              {agent.weakestQuestion
                                ? `${formatCount(agent.weakestQuestion.passedCount)} / ${formatCount(agent.weakestQuestion.failedCount)}`
                                : EM_DASH}
                            </td>
                            <td data-label="Avg. question score">
                              {agent.weakestQuestion
                                ? formatPercent(agent.weakestQuestion.averageScorePercentage)
                                : EM_DASH}
                            </td>
                            <td data-label="QA details" className="agent-details-cell">
                              <button
                                type="button"
                                className="agent-details-toggle"
                                aria-expanded={isExpanded}
                                aria-controls={`agent-qa-${agent.agentKey}`}
                                onClick={() => toggleAgent(agent.agentKey)}
                              >
                                {isExpanded ? "Hide" : "View"} <span aria-hidden="true">⌄</span>
                              </button>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr className="agent-qa-details-row">
                              <td colSpan={10}>
                                <div className="agent-qa-details" id={`agent-qa-${agent.agentKey}`}>
                                  <section className="agent-qa-section agent-qa-weakest">
                                    <h4>Weakest QA question</h4>
                                    {agent.weakestQuestion ? (
                                      <QaQuestionCard question={agent.weakestQuestion} tone="weakest" />
                                    ) : <p className="agent-qa-empty">No weakest question</p>}
                                  </section>
                                  <section className="agent-qa-section">
                                    <h4>Passed questions <span>{formatCount(passedQuestions.length)}</span></h4>
                                    <div className="agent-qa-list">
                                      {passedQuestions.length > 0 ? passedQuestions.map((question) => (
                                        <QaQuestionCard key={question.id} question={question} tone="passed" />
                                      )) : <p className="agent-qa-empty">No passed questions</p>}
                                    </div>
                                  </section>
                                  <section className="agent-qa-section">
                                    <h4>Not-passed questions <span>{formatCount(notPassedQuestions.length)}</span></h4>
                                    <div className="agent-qa-list">
                                      {notPassedQuestions.length > 0 ? notPassedQuestions.map((question) => (
                                        <QaQuestionCard key={question.id} question={question} tone="failed" />
                                      )) : <p className="agent-qa-empty">No failed questions</p>}
                                    </div>
                                  </section>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
