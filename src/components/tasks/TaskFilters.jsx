export function TaskFilters({ tasks, filters, onChange, onClear }) {
	const categories = [...new Set(tasks.map((task) => task.category).filter(Boolean))]

	return (
		<div className="task-filters" aria-label="Task filters">
			<label>
				<span>Search</span>
				<input
					type="search"
					value={filters.search}
					onChange={(event) => onChange({ search: event.target.value })}
					placeholder="Search titles"
				/>
			</label>
			<label>
				<span>Status</span>
				<select value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
					<option value="">All statuses</option>
					<option value="pending">Pending</option>
					<option value="completed">Completed</option>
					<option value="cancelled">Cancelled</option>
				</select>
			</label>
			<label>
				<span>Category</span>
				<select value={filters.category} onChange={(event) => onChange({ category: event.target.value })}>
					<option value="">All categories</option>
					{categories.map((category) => <option key={category} value={category}>{category}</option>)}
				</select>
			</label>
			<label>
				<span>Priority</span>
				<select value={filters.priority} onChange={(event) => onChange({ priority: event.target.value })}>
					<option value="">All priorities</option>
					<option value="high">High</option>
					<option value="medium">Medium</option>
					<option value="low">Low</option>
				</select>
			</label>
			<label>
				<span>Date</span>
				<input type="date" value={filters.date} onChange={(event) => onChange({ date: event.target.value })} />
			</label>
			<button type="button" className="filter-clear" onClick={onClear}>Clear filters</button>
		</div>
	)
}
