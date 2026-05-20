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
            'Guided starts are recipes. They prefill Ask AI, choose a target output, and still draft into the same review-first workspace model.',
            'Target output Auto lets AI choose a useful shape such as checklist, table, flowchart, outline, knowledge graph, Kanban board, chart rows, executive output, or news article.',
            'Use a specific target output when you know the surface you want. Ask AI can supplement missing process steps, relationship edges, task fields, table columns, chart rows, or executive findings so a sparse workspace can support that view.',
            'Accepted drafts are the only things that change the workspace graph. Unsourced or inferred items stay marked for review.'
        ]
    },
    {
        id: 'visual-auto',
        title: 'Target Output Auto',
        summary: 'Auto is a routing choice, not a mind-map default.',
        sections: [
            'Auto reads the intent first. “How do I...” tends to become a checklist or flowchart; comparisons tend to become tables; dependencies and ownership tend to become Connections.',
            'Available shapes include mind map, knowledge graph, flowchart, chart, Kanban, table, executive summary, news article, SME questions, software overlap, and handoff-style outputs.',
            'Pick a target output manually when you already know what you want TraceSpace to draft.',
            'Use No visual for an answer or review note that should not create visual structure.'
        ]
    },
    {
        id: 'sankey-flow-lens',
        title: 'Sankey Flow Lens',
        summary: 'Use source, target, and value rows to see evidence, handoffs, effort, or dependencies as weighted flow paths.',
        sections: [
            'From a new workspace, choose Guided starts on the empty canvas, or open Ask AI and choose the Sankey flow lens starter. The prompt asks for source, target, value, metric, review state, confidence, and source references.',
            'A useful Sankey request sounds like: “Show owner-to-status task flow,” “show source document to accepted finding flow,” “show system-to-process dependency flow,” or “turn this CSV/query result into source, target, value rows.”',
            'After AI drafts the result, review the draft first. Accept the structured evidence or chart artifact, then open Outputs / Table. The Flow lens appears when accepted rows have source, target, and a countable or numeric value.',
            'If the diagram does not appear, the missing shape is usually one of three fields: source, target, or value. Ask AI to normalize the rows into those columns, or add a value metric such as count, effort, cost, risk score, or confidence.',
            'Width means the selected metric, not truth. Inferred or prompt-only paths should stay needs-review until a reviewer confirms the data or source support.'
        ]
    },
    {
        id: 'workspace-model',
        title: 'Workspace Model',
        summary: 'Views are different work surfaces over the same accepted model.',
        sections: [
            'TraceSpace has 8 core workspace views: Map, Connections, Flowchart, Outline, Executive, Table, Tasks, and Kanban.',
            'TraceSpace stores accepted work as typed nodes, relationship edges, review states, source references, confidence, rationale, assumptions, and export metadata.',
            'Mind maps, Connections, flowcharts, Kanban, tables, executive outputs, and publishable articles read from that model instead of becoming unrelated copies.',
            'When a view looks empty or thin, ask AI to supplement the missing layer rather than starting over. For example: add relationship edges for Connections, process steps for Flowchart, task metadata for Kanban, or findings and risks for Executive view.'
        ]
    },
    {
        id: 'views-filters',
        title: 'Views And Filters',
        summary: 'Views change the canvas lens. Filters narrow what is visible.',
        sections: [
            'TraceSpace Map, Connections, Flowchart, Kanban, Table, Tasks, Outline, and Executive are views over the accepted workspace.',
            'Node filters like Needs review or Missing source hide nodes on the canvas until cleared.',
            'View actions can ask AI to create or prepare the structure that a view needs. Create / Review opens draft outputs that still need accept or reject.',
            'Reflow and direct dragging are map-oriented behaviors. Structured views use their own layouts and save metadata through accepted nodes and edges.'
        ]
    },
    {
        id: 'evidence-review',
        title: 'Evidence And Review',
        summary: 'Source support and review state travel with the model.',
        sections: [
            'Nodes, relationships, and generated artifacts can carry source references, confidence, rationale, assumptions, source signals, and review state.',
            'Source-backed means the item has a concrete source reference. Inferred or uncited content stays needs-review until a reviewer accepts it, cites it, or rewrites it.',
            'Use Missing source, Needs review, Source repair, and relationship review packets to find weak spots before publishing or handing work to another tool.'
        ]
    },
    {
        id: 'printable-maps',
        title: 'Printable Mind Maps',
        summary: 'Use map style and node emphasis to make exported maps easier to scan.',
        sections: [
            'Open Build / Map style to choose Clean, Print, or Sketchbook. Print uses a high-contrast light canvas; Sketchbook gives workshop-style cards and dashed connectors.',
            'Select a node, open Node metadata, and set Map emphasis to Key idea, Critical, Supporting, Evidence, or Action. Use Apply to branch when an entire section needs the same visual role.',
            'Make printable applies the print theme, depth hierarchy, emphasis badges, and auto-styles nodes in one step. Auto-style map only updates node emphasis. Reset styling clears emphasis and returns the map style to the default.',
            'Export PDF for handouts, PNG for slides, or SVG when the map needs editing in another graphics tool. Use structured exports such as JSON, Markdown, CSV, OPML, Mermaid, MMD JSON, Miro, or monday.com when another system needs the model.'
        ]
    },
    {
        id: 'demo-tour',
        title: 'Demo Workspace Tour',
        summary: 'Read seeded demo maps as a guided walkthrough before editing them.',
        sections: [
            'Start with the root card on the left. It names the workspace promise and points to the first useful actions.',
            'Follow the first-level cards from top to bottom. Demo maps usually show the brief, source library, review state, and alternate views as separate branches.',
            'Open a card menu or Node metadata to see the controls behind the example: review status, map emphasis, source support, and branch actions.',
            'Use Build / Map style / Make printable when you want the demo map to become a handout or stakeholder-facing snapshot.',
            'Demo workspaces are safe practice spaces. Rename, edit, restyle, or delete them once you have kicked the tires.'
        ]
    },
    {
        id: 'connections',
        title: 'Connections',
        summary: 'Review semantic relationships without treating the canvas layout as the only source of truth.',
        sections: [
            'Connections shows accepted relationship edges such as risks, dependencies, ownership, approvals, metrics, conflicts, and supporting links.',
            'Select two nodes in the knowledge graph view and use Connect to create a typed relationship edge. Then open the edge inspector to set relationship type, confidence, rationale, source signal, and review state.',
            'The canvas stays useful for exploration: select a node or edge to focus related context and dim unrelated context.',
            'Use Copy review or Download review to create a Markdown relationship packet grouped by relationship family, confidence, review state, source signal, rationale, and source references.'
        ]
    },
    {
        id: 'flowcharts',
        title: 'Flowcharts',
        summary: 'Flowchart view is a structured process surface, not a loose drawing canvas.',
        sections: [
            'Flowcharts use typed nodes such as process, decision, and terminator, plus connector metadata such as branch label, condition, and exception path.',
            'Use the flowchart view actions to add process steps, decisions, and endings. Use the edge inspector to label paths like Approved, Rejected, Retry, or Escalate.',
            'If a workspace was created as a map or knowledge graph, ask AI to supplement it with process steps and decision paths before relying on the flowchart.'
        ]
    },
    {
        id: 'structured-views',
        title: 'Kanban, Table, And Executive',
        summary: 'Structured views need the right model fields before they feel complete.',
        sections: [
            'Kanban works best when accepted nodes include task status, owner cues, priority, due dates, blockers, and dependencies. Use Prepare Kanban when the board is empty or too generic.',
            'Table view works best when nodes have consistent fields, source-backed rows, and review flags. Use Create table to supplement columns and row candidates.',
            'Executive view works best when the workspace has key findings, recommended actions, risks, required decisions, confidence, and source-backed appendix entries.'
        ]
    },
    {
        id: 'source-reconcile',
        title: 'Source Reconciliation',
        summary: 'Compare a selected source against the accepted graph before changing anything.',
        sections: [
            'Open Sources / Media, select one or more sources, then choose Reconcile with workspace.',
            'TraceSpace prepares citation repairs for matching graph nodes and separately flags source-only sections that may need placement. Multi-source selections and source sets can be used when the workspace needs broader reconciliation.',
            'Use the Source repair preview to accept useful repairs, supplement the graph, replace a branch, or keep both versions for comparison.',
            'Selected sources can also guide Ask AI so new drafts copy only allowed source references and keep unsupported claims in review.'
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
            'Accept modes let you supplement the current graph, replace a scope, update matching nodes, accept selected items, accept cited-only items, or keep the draft as preview-only.',
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
        id: 'publishable-outputs',
        title: 'Exports And Deliverables',
        summary: 'Executive summaries and news articles keep evidence metadata while using audience-friendly language.',
        sections: [
            'Standard exports include JSON, Markdown, CSV, OPML, MMD JSON, Mermaid, PNG, SVG, and PDF. Handoff projections can prepare model data for Miro, monday.com, stakeholder review, or implementation planning.',
            'Executive Summary is a leadership-oriented output with summary, key points, recommended actions, risks, required decisions, source-backed appendix, assumptions, and review state.',
            'News Article is meant for a broader audience. It should stay readable and less technical, while still carrying headline, dek, lede, sections, fact-check notes, source notes, source references, and assumptions.',
            'For news-style work, source-backed facts can be published with more confidence; unsupported claims should remain in assumptions or needs-review notes until verified.',
            'Publishable exports prefer accepted AI artifacts first, then the latest generated artifact, then a graph-derived fallback. Markdown keeps the audience-friendly article plus evidence summary and appendix; use the workspace review state for full metadata detail.'
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
