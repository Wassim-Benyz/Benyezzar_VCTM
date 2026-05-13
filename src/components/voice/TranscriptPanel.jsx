export function TranscriptPanel({ transcript }) {
  return (
    <section className="glass-card transcript-card" aria-label="Voice transcript">
      <div className="card-kicker">Live Input</div>
      <h2>Transcript</h2>
      <p className={transcript ? 'transcript-text' : 'empty-text'}>
        {transcript || 'No speech captured yet.'}
      </p>
    </section>
  )
}
