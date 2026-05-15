import { useState } from 'react';
import modalStore from '../stores/modalStore';

const HELP_ARTICLES = [
    {
        id: 'ask-ai',
        title: 'Ask AI',
        summary: 'Ask in plain language. TraceSpace drafts first, then you accept what belongs in the graph.',
        sections: [
            'Use the question box for normal requests like “turn this commissioning plan into tasks” or “map the RFI workflow.”',
            'Visual Auto lets AI choose a useful shape such as checklist, table, flowchart, outline, or graph draft.',
            'Accepted drafts are the only things that change the workspace graph.'
        ]
    },
    {
        id: 'visual-auto',
        title: 'Visual Auto',
        summary: 'Auto is a routing mode, not a mind-map default.',
        sections: [
            'Auto reads the intent first. “How do I...” tends to become a checklist; comparisons tend to become tables.',
            'Pick a visual manually when you already know the output you want.',
            'Use No visual for an answer or review note that should not create visual structure.'
        ]
    },
    {
        id: 'views-filters',
        title: 'Views And Filters',
        summary: 'Views change the canvas lens. Filters narrow what is visible.',
        sections: [
            'TraceSpace Map, Tasks, Table, Outline, and Connections are views over the accepted workspace.',
            'Node filters like Needs review or Missing source hide nodes on the canvas until cleared.',
            'Create / Review opens draft outputs that still need accept or reject.'
        ]
    },
    {
        id: 'draft-review',
        title: 'Draft Review',
        summary: 'Preview before accept keeps messy AI output out of the real graph.',
        sections: [
            'Review generated items in the draft panel before accepting.',
            'Items without sources stay marked for review.',
            'Discard closes the draft without changing the workspace.'
        ]
    },
    {
        id: 'debug-panel',
        title: 'Debug Panel',
        summary: 'Temporary developer panel for sharing unexpected app state.',
        sections: [
            'Use Debug when Ask AI, filters, or canvas views do not behave as expected.',
            'Copy the debug JSON and paste it into the conversation so the current view, graph, draft session, and recent activity can be inspected.',
            'The panel is read-only and does not change the workspace.'
        ]
    }
];

const HelpModal = () => {
    const popNode = modalStore((s) => s.popNode);
    const [activeArticleId, setActiveArticleId] = useState(HELP_ARTICLES[0].id);
    const activeArticle =
        HELP_ARTICLES.find((article) => article.id === activeArticleId) || HELP_ARTICLES[0];

    return (
        <div className="modal-container help-modal">
            <div className="help-modal-header">
                <div>
                    <span>Help</span>
                    <strong>{activeArticle.title}</strong>
                </div>
                <button type="button" onClick={() => popNode()}>
                    Close
                </button>
            </div>
            <div className="help-modal-body">
                <nav className="help-article-list" aria-label="Help articles">
                    {HELP_ARTICLES.map((article) => (
                        <button
                            key={article.id}
                            type="button"
                            className={article.id === activeArticle.id ? 'active' : ''}
                            onClick={() => setActiveArticleId(article.id)}
                        >
                            <strong>{article.title}</strong>
                            <span>{article.summary}</span>
                        </button>
                    ))}
                </nav>
                <article className="help-article">
                    <p>{activeArticle.summary}</p>
                    {activeArticle.sections.map((section) => (
                        <section key={section}>
                            {section}
                        </section>
                    ))}
                </article>
            </div>
        </div>
    );
};

export default HelpModal;
