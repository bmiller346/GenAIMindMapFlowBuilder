/* eslint-disable react/prop-types */
import { getAIDraftItemBadges } from '../../utils/aiDraftSessions';

const DraftBadges = ({ item, compact = false }) => {
    const badges = getAIDraftItemBadges(item);
    return (
        <span className={compact ? 'ai-draft-badges compact' : 'ai-draft-badges'}>
            {badges.map((badge) => (
                <span key={`${item.id}-${badge.id}`} className={`ai-draft-badge ${badge.tone}`}>
                    {badge.label}
                </span>
            ))}
        </span>
    );
};

export default DraftBadges;
