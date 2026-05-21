/* eslint-disable react/prop-types */
const DraftReviewNotes = ({ reviewNotes }) => {
    if (!reviewNotes.length) {
        return null;
    }
    return (
        <details className="ai-draft-details">
            <summary>{reviewNotes.length} review {reviewNotes.length === 1 ? 'note' : 'notes'}</summary>
            <div className="ai-draft-note-list">
                {reviewNotes.map((note) => (
                    <article key={`note-${note.id}`}>
                        <strong>{note.title}</strong>
                        {note.content ? <p>{note.content}</p> : null}
                    </article>
                ))}
            </div>
        </details>
    );
};

export default DraftReviewNotes;
