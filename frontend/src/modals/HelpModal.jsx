import { useState } from 'react';
import modalStore from '../stores/modalStore';
import useStore from '../stores/store';

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
        id: 'connections',
        title: 'Connections',
        summary: 'Review semantic relationships without treating the canvas layout as the only source of truth.',
        sections: [
            'Connections shows accepted relationship edges such as risks, dependencies, ownership, approvals, metrics, conflicts, and supporting links.',
            'The canvas stays useful for exploration: select a node or edge to focus the related branch and dim unrelated context.',
            'Use Copy review or Download review to create a Markdown relationship packet grouped by relationship family, confidence, review state, source signal, rationale, and source references.'
        ]
    },
    {
        id: 'source-reconcile',
        title: 'Source Reconciliation',
        summary: 'Compare a selected source against the accepted graph before changing anything.',
        sections: [
            'Open Sources / Media, select one or more sources, then choose Reconcile with workspace.',
            'TraceSpace prepares citation repairs for matching graph nodes and separately flags source-only sections that may need placement.',
            'Use the Source repair preview to accept useful repairs, supplement the graph, replace a branch, or keep both versions for comparison.'
        ]
    },
    {
        id: 'specialize-branch',
        title: 'Specialize Branch',
        summary: 'Turn a generic branch into domain-specific structure while preserving evidence.',
        sections: [
            'Open a node menu or slash command and choose Specialize branch when a branch is useful but too generic.',
            'Describe the domain, audience, product line, standard, or implementation context you want the branch adapted for.',
            'Source-backed content should remain intact. New or inferred items stay reviewable until accepted.'
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
        id: 'handoff',
        title: 'Handoff Packages',
        summary: 'Prepare accepted structure for implementation without losing provenance.',
        sections: [
            'Use handoff outputs when the graph is ready for monday, Miro, stakeholder review, or implementation planning.',
            'Handoff packages should include scope, ready items, blocked items, assumptions, open SME questions, and source references.',
            'External tools are projections. TraceSpace remains the canonical graph and review record.'
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
    const developerMode = useStore((s) => s.developerMode);
    const visibleArticles = developerMode
        ? HELP_ARTICLES
        : HELP_ARTICLES.filter((article) => article.id !== 'debug-panel');
    const [activeArticleId, setActiveArticleId] = useState(visibleArticles[0].id);
    const activeArticle =
        visibleArticles.find((article) => article.id === activeArticleId) || visibleArticles[0];

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
                    {visibleArticles.map((article) => (
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
