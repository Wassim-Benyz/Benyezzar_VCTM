const CREATE_MULTIPLE_TASKS_PATTERN =
  /^(create|add)\s+((multiple|two|three|four|five|\d+)\s+)?tasks\b\s*/i
const CREATE_TASK_PATTERNS = [/^(create|add)\s+(a\s+)?task\s+/i]
const READ_TASKS_PATTERN = /^(show|read|list)(\s+me)?\s+(my\s+)?tasks$/i
const READ_AGENDA_PATTERN =
  /^(what\s+(are|do)\s+.*|give\s+me\s+.*|show\s+.*|read\s+.*|list\s+.*)(tasks|agenda|have).*$/i
const DATE_FILTER_PATTERN = /\b(today'?s?|tomorrow)\b/i
const TIME_OF_DAY_PATTERN = /\b(morning|afternoon|evening)\b/i
const UPDATE_TASK_PATTERN =
  /^(update|change|move|reschedule)\s+(.+?)\s+to\s+(.+)$/i
const DELETE_MULTIPLE_TASKS_PATTERN = /^(delete|remove|clear)\s+(.+)$/i
const DELETE_TASK_PATTERN = /^(delete|remove)\s+(.+)$/i
const TIME_PATTERN = /\bat\s+(\d{1,2}(:\d{2})?\s?(am|pm)?)\b/i
const LOOSE_TIME_PATTERN = /\b(\d{1,2}(:\d{2})?\s?(am|pm))\b/i
const BARE_TIME_PATTERN = /^(\d{1,2}(:\d{2})?\s?(am|pm)?)$/i
const DATE_PATTERN =
  /\b(today|tomorrow|on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?)\b/i

export function parseVoiceCommand(transcript) {
  const text = stripPolitePhrases(normalizeTranscript(transcript))

  if (!text) {
    return unknownCommand('I did not hear a command.')
  }

  const readCommand = parseReadTasks(text)

  if (readCommand) {
    return readCommand
  }

  const createMultipleCommand = parseCreateMultipleTasks(text)

  if (createMultipleCommand) {
    return createMultipleCommand
  }

  const createCommand = parseCreateTask(text)

  if (createCommand) {
    return createCommand
  }

  const updateCommand = parseUpdateTask(text)

  if (updateCommand) {
    return updateCommand
  }

  const deleteMultipleCommand = parseDeleteMultipleTasks(text)

  if (deleteMultipleCommand) {
    return deleteMultipleCommand
  }

  const deleteCommand = parseDeleteTask(text)

  if (deleteCommand) {
    return deleteCommand
  }

  return unknownCommand()
}

function parseReadTasks(text) {
  if (!isReadTasksCommand(text)) {
    return null
  }

  return {
    intent: 'READ_TASKS',
    payload: removeEmptyValues({
      dateFilter: extractDateFilter(text),
      timeOfDay: extractMatch(text, TIME_OF_DAY_PATTERN),
    }),
  }
}

function parseCreateMultipleTasks(text) {
  const match = text.match(CREATE_MULTIPLE_TASKS_PATTERN)

  if (!match || !hasMultipleTaskSeparator(text)) {
    return null
  }

  const taskText = text.replace(CREATE_MULTIPLE_TASKS_PATTERN, '').trim()
  const sharedDate = extractMatch(taskText, DATE_PATTERN)
  const taskListText = taskText
    .replace(DATE_PATTERN, '')
    .replace(/^[:,-]\s*/, '')
    .trim()
  const tasks = splitTaskList(taskListText)
    .map((taskItem) => extractTaskDetails(taskItem))
    .map((task) => ({
      ...task,
      date: task.date || sharedDate,
    }))
    .filter((task) => task.title)

  if (tasks.length < 2) {
    return null
  }

  return {
    intent: 'CREATE_MULTIPLE_TASKS',
    payload: {
      tasks,
    },
  }
}

function parseCreateTask(text) {
  const pattern = CREATE_TASK_PATTERNS.find((commandPattern) =>
    commandPattern.test(text),
  )

  if (!pattern) {
    return null
  }

  const taskText = text.replace(pattern, '').trim()
  const details = extractTaskDetails(taskText)

  if (!details.title) {
    return unknownCommand('Please say what task you want to create.')
  }

  return {
    intent: 'CREATE_TASK',
    payload: details,
  }
}

function parseUpdateTask(text) {
  const match = text.match(UPDATE_TASK_PATTERN)

  if (!match) {
    return null
  }

  const searchText = cleanTaskSearchText(match[2])
  const updateText = match[3].trim()
  const updates = extractTaskDetails(updateText, { includeTitle: false })

  if (!searchText || (!updates.title && !updates.date && !updates.time)) {
    return unknownCommand('Please say which task to update and what to change.')
  }

  return {
    intent: 'UPDATE_TASK',
    payload: {
      searchText,
      updates: removeEmptyValues(updates),
    },
  }
}

function parseDeleteMultipleTasks(text) {
  const match = text.match(DELETE_MULTIPLE_TASKS_PATTERN)

  if (!match) {
    return null
  }

  const deleteVerb = match[1].toLowerCase()
  const targetText = match[2].trim()
  const dateFilter = extractDateFilter(targetText)

  if (isDeleteAllTarget(targetText, deleteVerb)) {
    return {
      intent: 'DELETE_MULTIPLE_TASKS',
      payload: {
        taskNames: [],
        dateFilter,
        deleteAll: true,
      },
    }
  }

  if (!hasMultipleTaskSeparator(targetText)) {
    return null
  }

  const taskNames = splitTaskList(targetText.replace(DATE_FILTER_PATTERN, ''))
    .map((taskName) => cleanTaskTitle(taskName))
    .filter(Boolean)

  if (taskNames.length < 2) {
    return null
  }

  return {
    intent: 'DELETE_MULTIPLE_TASKS',
    payload: {
      taskNames,
      dateFilter,
      deleteAll: false,
    },
  }
}

function parseDeleteTask(text) {
  const match = text.match(DELETE_TASK_PATTERN)

  if (!match) {
    return null
  }

  const searchText = cleanTaskTitle(match[2])

  if (!searchText) {
    return unknownCommand('Please say which task to delete.')
  }

  return {
    intent: 'DELETE_TASK',
    payload: {
      searchText,
    },
  }
}

function isDeleteAllTarget(text, deleteVerb) {
  const targetText = text
    .replace(DATE_FILTER_PATTERN, '')
    .replace(/\bmy\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return (
    (deleteVerb === 'clear' && /^(all(\s+tasks?)?|tasks?)$/i.test(targetText)) ||
    /^all(\s+tasks?)?$/i.test(targetText) ||
    /^tasks?$/i.test(targetText)
  )
}

function extractTaskDetails(text, { includeTitle = true } = {}) {
  const trimmedText = text.trim()
  const time =
    extractMatch(trimmedText, TIME_PATTERN) ||
    extractMatch(trimmedText, LOOSE_TIME_PATTERN) ||
    extractBareTime(trimmedText)
  const date = extractMatch(text, DATE_PATTERN)
  const title = cleanTaskTitle(
    text
      .replace(TIME_PATTERN, '')
      .replace(LOOSE_TIME_PATTERN, '')
      .replace(BARE_TIME_PATTERN, '')
      .replace(DATE_PATTERN, ''),
  )

  return removeEmptyValues({
    title: includeTitle ? title : '',
    date,
    time,
  })
}

function splitTaskList(text) {
  return text
    .replace(/\s+and\s+/gi, ', ')
    .split(',')
    .map((taskItem) => taskItem.trim())
    .filter(Boolean)
}

function hasMultipleTaskSeparator(text) {
  return text.includes(',') || /\s+and\s+/i.test(text)
}

function extractBareTime(text) {
  const match = text.match(BARE_TIME_PATTERN)

  if (!match) {
    return ''
  }

  return match[1].trim()
}

function extractDateFilter(text) {
  const dateFilter = extractMatch(text, DATE_FILTER_PATTERN)

  if (dateFilter.startsWith('today')) {
    return 'today'
  }

  return dateFilter
}

function extractMatch(text, pattern) {
  const match = text.match(pattern)

  if (!match) {
    return ''
  }

  return match[1].trim()
}

function cleanTaskTitle(text) {
  return text
    .replace(/^for\s+/i, '')
    .replace(/^task\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+task$/i, '')
    .replace(/\b(the|a)\s+task\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanTaskSearchText(text) {
  return cleanTaskTitle(text)
    .replace(/\s+(time|date)$/i, '')
    .trim()
}

function normalizeTranscript(transcript) {
  return String(transcript || '')
    .replace(/\b([ap])\.?\s?m\.?/gi, '$1m')
    .replace(/[.?!]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPolitePhrases(text) {
  return text
    .replace(/^(please\s+)?(can|could|would)\s+you\s+(please\s+)?/i, '')
    .replace(/^please\s+/i, '')
    .replace(/\s+please$/i, '')
    .trim()
}

function isReadTasksCommand(text) {
  const normalizedText = text.toLowerCase()

  return (
    READ_TASKS_PATTERN.test(text) ||
    READ_AGENDA_PATTERN.test(text) ||
    /^what\s+tasks\s+do\s+i\s+have$/.test(normalizedText) ||
    /^what\s+do\s+i\s+have(\s+(today|tomorrow|morning|afternoon|evening))*$/.test(
      normalizedText,
    ) ||
    /^(show|read|list)\s+.*tasks$/.test(normalizedText)
  )
}

function removeEmptyValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => Boolean(value)),
  )
}

function unknownCommand(message) {
  return {
    intent: 'UNKNOWN',
    payload: {},
    message:
      message ||
      'I am not sure what you want me to do. You can say create, update, delete, or list tasks.',
  }
}
