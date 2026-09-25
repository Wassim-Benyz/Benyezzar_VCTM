import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DATE_RANGES, getDateRange, normalizeRangeId } from '../../features/analytics/dateRanges'
import {
  getCompletedTasksInRange,
  getSummaryMetrics,
  groupCompletionsByDay,
  groupCompletionsByTimeOfDay,
} from '../../features/analytics/analyticsMetrics'
import { generateInsights, getSevenDayComparison } from '../../features/analytics/analyticsInsights'

export function AnalyticsDashboard({
  rangeId = 'last7',
  onRangeChange,
  tasks = [],
  isLoading = false,
  error = '',
}) {
  const now = new Date()
  const activeRangeId = normalizeRangeId(rangeId)
  const range = getDateRange(activeRangeId, now)
  const summary = getSummaryMetrics(tasks, range, now)
  const completedTasks = getCompletedTasksInRange(tasks, range)
  const dayData = groupCompletionsByDay(completedTasks)
  const timeData = groupCompletionsByTimeOfDay(completedTasks)
  const comparison = getSevenDayComparison(tasks, now)
  const insights = generateInsights({ completedByDay: dayData, completedByTime: timeData, comparison, summary })
  const completionOverTime = getCompletionTimeline(completedTasks)
  const hasTasks = tasks.length > 0
  const hasCompletedTasks = completedTasks.length > 0

  return (
    <main className="analytics-page">
      <div className="analytics-heading">
        <div>
          <div className="eyebrow">Recorded activity</div>
          <h1>Analytics</h1>
          <p>Read-only signals from your task history, grounded in the activity you recorded.</p>
        </div>
        <label className="range-control">
          <span>Time range</span>
          <select value={activeRangeId} onChange={(event) => onRangeChange?.(event.target.value)}>
            {DATE_RANGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      {isLoading ? <EmptyAnalyticsState text="Loading tasks..." /> : null}
      {error ? <p className="system-alert" role="alert">{error}</p> : null}
      {!hasTasks ? <EmptyAnalyticsState text="Analytics will appear after you record some tasks." /> : null}
      <section className="metric-grid" aria-label={`${range.label} summary`}>
        <MetricCard label="Tasks created" value={summary.totalCreated} detail="Based on createdAt" />
        <MetricCard label="Completed" value={summary.completed} detail="Completed status in population" />
        <MetricCard label="Completion rate" value={summary.completionRate === null ? 'Not enough data' : `${Math.round(summary.completionRate)}%`} detail="Cancelled tasks excluded" />
        <MetricCard label="Rescheduled" value={summary.rescheduled} detail="rescheduleCount greater than zero" />
      </section>

      <section className="chart-grid" aria-label="Analytics charts">
        <ChartCard title="Tasks completed over time" summary={getChartSummary(completionOverTime, 'completions')}>
          {hasCompletedTasks ? <ResponsiveContainer width="100%" height="100%"><LineChart data={completionOverTime}><CartesianGrid stroke="rgba(150,190,255,.12)" /><XAxis dataKey="name" stroke="#8f9fc6" /><YAxis allowDecimals={false} stroke="#8f9fc6" /><Tooltip /><Line type="monotone" dataKey="value" name="Completed" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <EmptyChart text="No valid completedAt timestamps in this period." />}
        </ChartCard>
        <ChartCard title="Completion by day of week" summary={getChartSummary(dayData, 'completions')}>
          {hasCompletedTasks ? <BarChart data={dayData} /> : <EmptyChart text="No valid completedAt timestamps in this period." />}
        </ChartCard>
        <ChartCard title="Completion by time of day" summary={getChartSummary(timeData, 'completions')}>
          {hasCompletedTasks ? <BarChart data={timeData} /> : <EmptyChart text="No valid completedAt timestamps in this period." />}
        </ChartCard>
      </section>

      <section className="insights-section" aria-labelledby="patterns-heading">
        <div className="section-heading"><div className="card-kicker">Deterministic observations</div><h2 id="patterns-heading">Observed Patterns</h2></div>
        {insights.length ? <ul className="insight-list">{insights.map((insight) => <li key={insight}>{insight}</li>)}</ul> : <p className="empty-text">More recorded activity is needed before patterns can be shown. Insights require at least three recorded completions or tasks.</p>}
      </section>

      <aside className="data-notice"><strong>About these analytics</strong><p>Analytics use only recorded task-management activity. They do not measure overall productivity. Older tasks may lack timestamps or metadata, and patterns become more representative as more activity is recorded.</p></aside>
    </main>
  )
}

function MetricCard({ label, value, detail }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function ChartCard({ title, summary, children }) {
  return <article className="chart-card"><div className="chart-title"><h2>{title}</h2><p>{summary}</p></div><div className="chart-body">{children}</div></article>
}

function BarChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><CartesianGrid stroke="rgba(150,190,255,.12)" /><XAxis dataKey="name" stroke="#8f9fc6" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} stroke="#8f9fc6" /><Tooltip /><Area type="monotone" dataKey="value" name="Tasks" stroke="#9b5cff" fill="rgba(155,92,255,.2)" /></AreaChart></ResponsiveContainer>
}

function EmptyChart({ text }) {
  return <div className="empty-chart">{text}</div>
}

function EmptyAnalyticsState({ text }) {
  return <div className="analytics-empty" role="status">{text}</div>
}

function getCompletionTimeline(tasks) {
  const byDate = new Map()
  tasks.forEach((task) => {
    const date = new Date(task.completedAt).toISOString().slice(0, 10)
    byDate.set(date, (byDate.get(date) || 0) + 1)
  })
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, value }))
}

function getChartSummary(data, noun) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return `${total} recorded ${noun}`
}
