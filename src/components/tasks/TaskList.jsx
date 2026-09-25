import { TaskFilters } from './TaskFilters'
import { TaskItem } from './TaskItem'

export function TaskList({ tasks, filters, onFilterChange, onClearFilters, onComplete, onReopen, onEdit, onReschedule, onDelete, isLoading = false, isBusy = false, error = '' }) {
  return (
    <section className="glass-card task-card" aria-label="Tasks">
      <div className="card-header">
        <div>
          <div className="card-kicker">Local Memory</div>
          <h2>Tasks</h2>
        </div>
        <span className="task-count">{tasks.length}</span>
      </div>

      <TaskFilters tasks={tasks} filters={filters} onChange={onFilterChange} onClear={onClearFilters} />
      {error ? <p className="system-alert" role="alert">{error}</p> : null}
      {isLoading ? (
        <p className="empty-text">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="empty-text">No tasks match these filters. Try clearing them or use your voice to add a task.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => <TaskItem key={task.id} task={task} onComplete={onComplete} onReopen={onReopen} onEdit={onEdit} onReschedule={onReschedule} onDelete={onDelete} isBusy={isBusy} />)}
        </ul>
      )}
    </section>
  )
}
