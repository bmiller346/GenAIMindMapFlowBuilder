/* eslint-disable react/prop-types */
import DraftBadges from './DraftBadges';

const DraftProjection = ({ items, selectedSet, onToggleItem, hasArtifactPreviews }) => {
    if (items.length === 0) {
        if (hasArtifactPreviews) {
            return null;
        }
        return (
            <div className="ai-draft-empty" role="status">
                <strong>No draft items yet</strong>
                <span>
                    Ask for a concrete structure or more detail. Nothing changes in the graph
                    until you accept the draft.
                </span>
            </div>
        );
    }
    return (
        <div className="ai-draft-projection">
            {items.map((item) => (
                <article key={`draft-${item.id}`} className="ai-draft-item">
                    <label>
                        <input
                            type="checkbox"
                            checked={selectedSet.has(item.id)}
                            onChange={() => onToggleItem(item.id)}
                        />
                        <span>{selectedSet.has(item.id) ? 'Selected' : 'Select'}</span>
                    </label>
                    <strong>{item.title}</strong>
                    {item.content ? (
                        <p>{item.content}</p>
                    ) : (
                        <p className="ai-draft-weak-preview">
                            This draft item has structure but no body yet. Refine the prompt to add
                            detail, sources, or acceptance criteria before accepting it.
                        </p>
                    )}
                    <DraftBadges item={item} />
                </article>
            ))}
        </div>
    );
};

export default DraftProjection;
