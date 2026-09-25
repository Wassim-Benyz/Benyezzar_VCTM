import { useState } from 'react'
import { formatTaskSchedule, isTaskOverdue } from '../../features/tasks/taskModel'

export function TaskItem({ task, onComplete, onReopen, onEdit, onReschedule, onDelete, isBusy = false }) {
	const [isEditing, setIsEditing] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [draft, setDraft] = useState({
		title: task.title,
		description: task.description,
		category: task.category,
		priority: task.priority,
	})
	const overdue = isTaskOverdue(task)
	const isDisabled = isBusy || isSubmitting

	const saveEdit = async (event) => {
		event.preventDefault()
		if (draft.title.trim()) {
			setIsSubmitting(true)
			try {
				await onEdit(task.id, { ...draft, title: draft.title.trim() }, 'visual')
				setIsEditing(false)
			} catch {
				// The task hook exposes the user-facing API error.
			} finally {
				setIsSubmitting(false)
			}
		}
	}

	const runAction = async (action) => {
		setIsSubmitting(true)
		try {
			await action()
		} catch {
			// The task hook exposes the user-facing API error.
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<li className={`task-item ${overdue ? 'is-overdue' : ''}`}>
			<div className="task-main">
				<div className="task-title-row">
					<strong title={task.title}>{task.title}</strong>
					{overdue ? <span className="task-badge overdue-badge">Overdue</span> : null}
				</div>
				<div className="task-meta">
					<span className={`task-badge priority-${task.priority}`}>{task.priority}</span>
					<span className="task-badge">{task.status}</span>
					{task.category ? <span className="task-badge">{task.category}</span> : null}
				</div>
				<p className="task-schedule">{formatTaskSchedule(task)}</p>
				{task.description ? <p className="task-description">{task.description}</p> : null}
			</div>
			<div className="task-actions" aria-label={`Actions for ${task.title}`}>
				{task.status === 'completed' ? (
					<button type="button" onClick={() => runAction(() => onReopen(task.id, 'visual'))} disabled={isDisabled} aria-label={`Reopen ${task.title}`} title="Reopen">↩</button>
				) : (
					<button type="button" onClick={() => runAction(() => onComplete(task.id, 'visual'))} disabled={isDisabled} aria-label={`Complete ${task.title}`} title="Complete">✓</button>
				)}
				<button type="button" onClick={() => setIsEditing((value) => !value)} disabled={isDisabled} aria-label={`Edit ${task.title}`} title="Edit">✎</button>
				<button type="button" onClick={() => runAction(() => onReschedule(task))} disabled={isDisabled} aria-label={`Reschedule ${task.title}`} title="Reschedule">◷</button>
				<button type="button" className="danger-action" onClick={() => runAction(() => onDelete(task))} disabled={isDisabled} aria-label={`Delete ${task.title}`} title="Delete">×</button>
			</div>
			{isEditing ? (
				<form className="task-edit-panel" onSubmit={saveEdit}>
					<input aria-label="Task title" value={draft.title} disabled={isDisabled} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
					<input aria-label="Task category" placeholder="Category" value={draft.category} disabled={isDisabled} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
					<select aria-label="Task priority" value={draft.priority} disabled={isDisabled} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
						<option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option>
					</select>
					<textarea aria-label="Task description" placeholder="Description" value={draft.description} disabled={isDisabled} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
					<button type="submit" disabled={isDisabled}>Save</button>
				</form>
			) : null}
		</li>
	)
}
