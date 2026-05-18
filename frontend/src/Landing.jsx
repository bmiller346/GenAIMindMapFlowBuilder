import { Link } from 'react-router-dom';
import {
    FiArrowRight,
    FiCheckSquare,
    FiDatabase,
    FiFileText,
    FiGitBranch,
    FiGrid,
    FiLayers,
    FiSearch,
    FiShield,
    FiUploadCloud
} from 'react-icons/fi';
import './Landing.css';

const flowSteps = [
    'Add sources',
    'Build workspace',
    'Review evidence',
    'Preview changes',
    'Handoff work'
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
        title: 'Structure',
        text: 'View the same material as a map, outline, table, task list, checklist, flowchart, or knowledge graph.',
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
        title: 'Handoff',
        text: 'Package reviewed work for implementation, stakeholder review, Miro, monday.com, or export.',
        icon: FiCheckSquare
    }
];

const differentiators = [
    'Source-grounded, not just summarized',
    'Preview changes before they apply',
    'One accepted workspace, many views',
    'Maps, tables, tasks, checklists, flowcharts, and knowledge graphs',
    'Confidence, citation, rationale, and review states',
    'Relationship review exports for stakeholder handoff',
    'Built for reviewable handoff'
];

const useCases = [
    'Review a standards folder for missing pieces',
    'Software inventory overlap and rationalization report',
    'Turn a complex document into a team roadmap',
    'SOP to checklist',
    'Requirements doc to implementation plan',
    'Excel tracker to task/status map',
    'Source coverage and gap report',
    'Knowledge graph for risks, dependencies, ownership, metrics, and approvals',
    'Relationship review packet for stakeholder signoff',
    'Implementation handoff package'
];

export const Landing = () => (
    <main className="landing-page">
        <section className="landing-hero" aria-labelledby="landing-title">
            <nav className="landing-nav" aria-label="TraceSpace">
                <Link to="/" className="landing-product-mark" aria-label="Open workspace">
                    <span className="landing-mark">
                        <FiGitBranch />
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
                    <h1 id="landing-title">Turn messy source material into trusted workspaces.</h1>
                    <p className="landing-value">
                        TraceSpace turns documents, folders, notes, and trackers into
                        source-cited maps, graphs, tables, checklists, roadmaps, and
                        handoff packages.
                    </p>
                    <p className="landing-support">
                        Use AI to find structure, gaps, relationships, and next actions
                        without changing accepted work until you preview and approve it.
                    </p>
                    <div className="landing-actions">
                        <Link to="/" className="landing-primary-cta">
                            Open workspace
                            <FiArrowRight />
                        </Link>
                    </div>
                </div>

                <div className="landing-graph-visual" aria-hidden="true">
                    <div className="source-stack">
                        <span><FiFileText /> Requirements.docx</span>
                        <span><FiGrid /> Tracker.xlsx</span>
                        <span><FiDatabase /> Source notes</span>
                    </div>
                    <div className="graph-stage">
                        <span className="graph-line graph-line-a" />
                        <span className="graph-line graph-line-b" />
                        <span className="graph-line graph-line-c" />
                        <span className="graph-node node-source">Source</span>
                        <span className="graph-node node-map">Reconcile</span>
                        <span className="graph-node node-review">Review</span>
                        <span className="graph-node node-task">Handoff</span>
                        <span className="confidence-chip"><FiSearch /> cited 0.86</span>
                    </div>
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

        <section className="landing-section" id="how-it-works">
            <div className="landing-section-heading">
                <p>How it works</p>
                <h2>From evidence to accountable structure</h2>
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
