export function TaskList({ tasks }) {
  return (
    <section className="glass-card task-card" aria-label="Tasks">
      <div className="card-header">
        <div>
          <div className="card-kicker">Local Memory</div>
          <h2>Tasks</h2>
        </div>
        <span className="task-count">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-text">No tasks yet.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li className="task-item" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.status}</span>
              </div>
              <p>
                {task.date || 'unscheduled'}
                {task.time ? ` at ${task.time}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
