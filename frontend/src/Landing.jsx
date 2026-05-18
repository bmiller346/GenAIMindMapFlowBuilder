import { Link } from 'react-router-dom';
import {
    FiArrowRight,
    FiBookOpen,
    FiBriefcase,
    FiClipboard,
    FiGitBranch,
    FiLayers,
    FiMail,
    FiPrinter,
    FiRefreshCw,
    FiSearch,
    FiSend,
    FiShield,
    FiUploadCloud
} from 'react-icons/fi';
import landingLogo from './assets/landing-logo.svg';
import landingWorkspacePreview from './assets/landing-workspace-preview.png';
import './Landing.css';

const flowSteps = [
    'Collect sources',
    'Build the model',
    'Shape the views',
    'Review evidence',
    'Choose export path',
    'Publish or hand off'
];

const howItWorks = [
    {
        title: 'Ingest',
        text: 'Bring in documents, spreadsheets, notes, standards, folders, and other messy inputs.',
        icon: FiUploadCloud
    },
    {
        title: 'Connect',
        text: 'Build a source-cited workspace that links ideas, requirements, gaps, decisions, tasks, and reviewable relationships.',
        icon: FiGitBranch
    },
    {
        title: 'Model',
        text: 'Turn source chunks into typed nodes, relationship edges, owners, dependencies, risks, and review states.',
        icon: FiLayers
    },
    {
        title: 'Review',
        text: 'Check citations, assumptions, confidence, missing information, and needs-review items.',
        icon: FiShield
    },
    {
        title: 'Refine',
        text: 'Use AI drafts to reshape selected branches without changing the accepted workspace until you approve.',
        icon: FiSearch
    },
    {
        title: 'Export',
        text: 'Package reviewed work as AEC deliverable reviews, executive reports, newsletters, help outlines, Pinnacle overviews, Miro boards, monday.com work, or PDF exports.',
        icon: FiSend
    }
];

const creationLens = [
    {
        title: 'Node model',
        text: 'Requirements, decisions, deliverables, risks, gaps, tasks, questions, and sources become structured workspace objects.'
    },
    {
        title: 'Relationship layer',
        text: 'Edges capture depends on, blocks, supports, conflicts with, routes to, and handoff relationships.'
    },
    {
        title: 'Review contract',
        text: 'Each item can carry citations, confidence, rationale, assumptions, owner placeholders, and needs-review status.'
    },
    {
        title: 'View adapters',
        text: 'The same accepted model can render as a mind map, knowledge graph, flowchart, table, checklist, report, or handoff package.'
    },
    {
        title: 'View reconciliation',
        text: 'Ask AI to supplement missing relationships, process steps, task fields, table columns, or executive findings so one view can become another.'
    },
    {
        title: 'Professional authoring',
        text: 'Flowcharts, relationship graphs, and boards keep typed nodes, edges, labels, review states, and source evidence instead of becoming loose drawings.'
    }
];

const viewCapabilities = [
    {
        title: 'Mind map',
        text: 'Organize hierarchy, branch structure, source-backed ideas, gaps, and reviewable next steps.'
    },
    {
        title: 'Knowledge graph',
        text: 'Author typed relationships, inspect rationale and confidence, track source refs, and prepare relationship review packets.'
    },
    {
        title: 'Flowchart',
        text: 'Shape processes with decisions, terminators, branch labels, exception paths, and saved connector metadata.'
    },
    {
        title: 'Kanban',
        text: 'Use task/status/owner/priority/dependency metadata; ask AI to prepare the board when the model is too sparse.'
    },
    {
        title: 'Table',
        text: 'Turn accepted nodes and evidence into structured rows and columns for scanning, comparison, and export.'
    },
    {
        title: 'Executive view',
        text: 'Synthesize findings, actions, risks, decisions, confidence, and source appendices for leadership review.'
    }
];

const scenarioCards = [
    {
        title: 'AEC deliverables',
        text: 'Review SOWs, project briefs, standards, meeting notes, and deliverable lists for missing information, discipline dependencies, risks, assumptions, and owner decisions.',
        icon: FiClipboard
    },
    {
        title: 'Executive reports',
        text: 'Turn source-backed findings into repeatable leadership packets with findings, actions, risks, decisions, and source appendices.',
        icon: FiBriefcase
    },
    {
        title: 'Newsletters',
        text: 'Create consistent updates that reuse the same pillars, sections, highlights, and review markers each cycle.',
        icon: FiMail
    },
    {
        title: 'Help articles',
        text: 'Use maps, outlines, and flowcharts to plan walkthroughs, expose missing steps, and guide authors toward complete help content.',
        icon: FiBookOpen
    },
    {
        title: 'Pinnacle overviews',
        text: 'Export mind maps and flow charts as high-level section overviews that explain how features, tasks, and decisions connect.',
        icon: FiGitBranch
    }
];

const exportPillars = [
    'Audience and decision',
    'Context and evidence',
    'Findings and importance',
    'Actions, owners, and risks',
    'Review state and source trail'
];

const differentiators = [
    'Source-grounded, not just summarized',
    'Preview changes before they apply',
    'Structured workspace model before export',
    'Typed nodes, relationship edges, owners, dependencies, and review states',
    'One accepted model, many views',
    'Reusable export patterns for reports, newsletters, help, and walkthroughs',
    'Maps, tables, tasks, checklists, flowcharts, executive outputs, and knowledge graphs',
    'Relationship review exports for stakeholder handoff'
];

const useCases = [
    'AEC SOW review for missing scope, assumptions, owner decisions, and discipline handoffs',
    'Map design, engineering, construction, operations, and client dependencies across a project timeline',
    'Project deliverable handoff to Miro or monday.com',
    'Review a standards folder for missing pieces',
    'Software inventory overlap and rationalization report',
    'Turn a complex document into a team roadmap',
    'Create an executive report from source-backed findings',
    'Build a recurring newsletter from the same editorial pillars',
    'Draft help article outlines and workflow walkthroughs',
    'Export Pinnacle-ready section maps and flow charts',
    'SOP to checklist',
    'Requirements doc to implementation plan',
    'Excel tracker to task/status map',
    'Source coverage and gap report',
    'Knowledge graph for risks, dependencies, ownership, metrics, and approvals',
    'Relationship review packet for stakeholder signoff',
    'Implementation handoff package'
];

export const Landing = () => {
    const handlePrint = () => {
        window.print();
    };

    return (
        <main className="landing-page">
        <section className="landing-hero" aria-labelledby="landing-title">
            <nav className="landing-nav" aria-label="TraceSpace">
                <Link to="/" className="landing-product-mark" aria-label="Open workspace">
                    <span className="landing-mark">
                        <img src={landingLogo} alt="" />
                    </span>
                    <span>TraceSpace</span>
                </Link>
                <Link to="/" className="landing-nav-link">
                    Open workspace
                </Link>
            </nav>

            <div className="landing-hero-grid">
                <div className="landing-hero-copy">
                    <p className="landing-kicker">Source-grounded thinking workspace</p>
                    <h1 id="landing-title">Turn messy knowledge into trusted exports.</h1>
                    <p className="landing-value">
                        TraceSpace turns documents, folders, notes, and trackers into
                        source-cited workspaces, visual overviews, AEC deliverable
                        reviews, executive reports, newsletters, help outlines, and
                        Miro or monday.com handoff packages.
                    </p>
                    <p className="landing-support">
                        Use AI to find structure, gaps, relationships, and next actions,
                        then publish repeatable exports that keep the important pillars
                        visible for every audience.
                    </p>
                    <div className="landing-actions">
                        <Link to="/" className="landing-primary-cta">
                            Open workspace
                            <FiArrowRight />
                        </Link>
                        <button
                            className="landing-secondary-cta landing-print-cta"
                            type="button"
                            onClick={handlePrint}
                        >
                            Save PDF
                            <FiPrinter />
                        </button>
                    </div>
                </div>

                <div className="landing-workspace-preview" aria-hidden="true">
                    <img
                        src={landingWorkspacePreview}
                        alt=""
                        loading="eager"
                    />
                </div>
            </div>
        </section>

        <section className="landing-flow" aria-label="TraceSpace flow">
            {flowSteps.map((step, index) => (
                <div className="landing-flow-step" key={step}>
                    <span>{step}</span>
                    {index < flowSteps.length - 1 ? <FiArrowRight aria-hidden="true" /> : null}
                </div>
            ))}
        </section>

        <section className="landing-section landing-model-layer" aria-labelledby="landing-model-layer-title">
            <div className="landing-section-heading">
                <p>Creation layer</p>
                <h2 id="landing-model-layer-title">The export starts as a structured workspace model</h2>
            </div>
            <div className="landing-model-panel">
                <div className="landing-model-intro">
                    <FiGitBranch aria-hidden="true" />
                    <h3>TraceSpace creates the lens first, then the deliverable.</h3>
                    <p>
                        AI drafts turn source material into a reviewable model of nodes,
                        relationships, evidence, dependencies, risks, and ownership. Mind
                        maps, knowledge graphs, flowcharts, task boards, reports, and
                        handoff packages are different views of that accepted model.
                    </p>
                </div>
                <div className="landing-model-grid">
                    {creationLens.map(({ title, text }) => (
                        <article key={title}>
                            <span>{title}</span>
                            <p>{text}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>

        <section className="landing-section" id="how-it-works">
            <div className="landing-section-heading">
                <p>How it works</p>
                <h2>From evidence to accountable output</h2>
            </div>
            <div className="landing-work-grid">
                {howItWorks.map(({ title, text, icon: Icon }) => (
                    <article className="landing-work-card" key={title}>
                        <Icon aria-hidden="true" />
                        <h3>{title}</h3>
                        <p>{text}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="landing-section landing-view-capabilities" aria-labelledby="landing-view-capabilities-title">
            <div className="landing-section-heading">
                <p>Model-aware views</p>
                <h2 id="landing-view-capabilities-title">Views are work surfaces, not just export formats</h2>
            </div>
            <div className="landing-view-panel">
                <div className="landing-view-intro">
                    <FiLayers aria-hidden="true" />
                    <h3>Each view reads and writes the same accepted workspace model.</h3>
                    <p>
                        When a view needs more structure, AI can add the missing layer:
                        relationships for a knowledge graph, process steps for a flowchart,
                        task fields for Kanban, table columns, or executive-ready findings.
                    </p>
                </div>
                <div className="landing-view-grid">
                    {viewCapabilities.map(({ title, text }) => (
                        <article key={title}>
                            <span>{title}</span>
                            <p>{text}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>

        <section className="landing-section landing-scenarios">
            <div className="landing-section-heading">
                <p>Export scenarios</p>
                <h2>Build once, explain it in the format people need</h2>
            </div>
            <div className="landing-scenario-grid">
                {scenarioCards.map(({ title, text, icon: Icon }) => (
                    <article className="landing-scenario-card" key={title}>
                        <Icon aria-hidden="true" />
                        <h3>{title}</h3>
                        <p>{text}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="landing-section landing-export-studio">
            <div className="landing-section-heading">
                <p>Export Studio</p>
                <h2>Repeatable deliverables with the right pillars every time</h2>
            </div>
            <div className="landing-export-panel">
                <div>
                    <FiRefreshCw aria-hidden="true" />
                    <h3>Keep exports consistent across teams, cycles, and audiences.</h3>
                    <p>
                        Executive reports, newsletters, help content, workflow walkthroughs,
                        and Pinnacle overviews can all draw from the same reviewed workspace
                        while keeping their own structure, tone, and review expectations.
                    </p>
                </div>
                <ol className="landing-pillar-list" aria-label="Export pillars">
                    {exportPillars.map((pillar) => (
                        <li key={pillar}>{pillar}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="landing-section landing-split">
            <div className="landing-section-heading">
                <p>What makes it different</p>
                <h2>Not a generic AI task app</h2>
            </div>
            <div className="landing-difference-panel">
                {differentiators.map((item) => (
                    <div key={item}>
                        <FiShield aria-hidden="true" />
                        <span>{item}</span>
                    </div>
                ))}
            </div>
        </section>

        <section className="landing-section">
            <div className="landing-section-heading">
                <p>Example use cases</p>
                <h2>Useful wherever evidence has to become accountable work</h2>
            </div>
            <div className="landing-use-cases">
                {useCases.map((useCase) => (
                    <article key={useCase}>
                        <span>{useCase}</span>
                    </article>
                ))}
            </div>
        </section>

        <footer className="landing-footer">
            <span>TraceSpace</span>
            <Link to="/">Open workspace</Link>
        </footer>
    </main>
    );
};
