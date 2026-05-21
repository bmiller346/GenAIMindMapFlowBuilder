/* eslint-disable react/prop-types */
const DraftRevisionTimeline = ({
    promptHistory,
    prompt,
    promptRef,
    onPromptChange,
    onSubmitRevision,
    isRevising
}) => (
    <div className="ai-draft-conversation" aria-label="Refine draft">
        {promptHistory.length > 1 ? (
            <div className="ai-draft-history">
                {promptHistory.map((entry, index) => (
                    <p key={`${entry.revision_id || index}-${entry.created_at}`}>
                        <span>{entry.role || 'user'}</span>
                        {entry.content}
                    </p>
                ))}
            </div>
        ) : null}
        <label>
            Refine draft
            <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        onSubmitRevision();
                    }
                }}
                placeholder="Ask for a sharper structure, a different view, or more detail."
            />
        </label>
        <button type="button" onClick={onSubmitRevision} disabled={isRevising || !prompt.trim()}>
            {isRevising ? 'Revising' : 'Add revision'}
        </button>
    </div>
);

export default DraftRevisionTimeline;
