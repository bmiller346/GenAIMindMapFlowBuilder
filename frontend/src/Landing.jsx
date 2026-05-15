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
    'Add source',
    'Generate structure',
    'Review confidence and citations',
    'Find relationships',
    'Convert to tasks, checklists, tables, or handoff packages'
];

const howItWorks = [
    {
        title: 'Ingest',
        text: 'Bring in documents, spreadsheets, notes, source files, and other messy inputs.',
        icon: FiUploadCloud
    },
    {
        title: 'Structure',
        text: 'Turn source material into a mind map, outline, table, tasks, or reviewable checklist.',
        icon: FiLayers
    },
    {
        title: 'Connect',
        text: 'See graph relationships, dependencies, duplicate ideas, and missing links.',
        icon: FiGitBranch
    },
    {
        title: 'Review',
        text: 'Check confidence, citations, gaps, and needs-review states before work changes hands.',
        icon: FiShield
    },
    {
        title: 'Handoff',
        text: 'Export useful packages for implementation, project tracking, or stakeholder review.',
        icon: FiCheckSquare
    }
];

const differentiators = [
    'Source-backed outputs',
    'Preview before mutation',
    'Confidence and review states',
    'One canonical graph, many views',
    'Built for serious project and document transformation'
];

const useCases = [
    'SOP to checklist',
    'Excel tracker to task/status map',
    'Requirements doc to implementation plan',
    'Meeting notes to action plan',
    'Standards doc to source coverage map'
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
                    <p className="landing-kicker">Source-aware workspace</p>
                    <h1 id="landing-title">TraceSpace</h1>
                    <p className="landing-value">
                        TraceSpace turns documents, spreadsheets, notes, and messy source
                        material into structured workspaces you can trust.
                    </p>
                    <p className="landing-support">
                        Turn messy source material into trusted, reviewable maps, connections,
                        tasks, and handoffs.
                    </p>
                    <div className="landing-actions">
                        <Link to="/" className="landing-primary-cta">
                            Open workspace
                            <FiArrowRight />
                        </Link>
                        <button type="button" className="landing-secondary-cta" disabled>
                            Demo not implemented
                        </button>
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
                        <span className="graph-node node-map">Map</span>
                        <span className="graph-node node-review">Review</span>
                        <span className="graph-node node-task">Tasks</span>
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
                <h2>From source material to reviewable structure</h2>
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
                <h2>Not just a mind map app</h2>
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
                <h2>Useful wherever messy inputs become accountable work</h2>
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
