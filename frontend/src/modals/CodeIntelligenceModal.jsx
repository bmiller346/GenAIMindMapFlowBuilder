import { useEffect, useMemo, useState } from 'react';
import CROSSSvg from '../assets/cross.svg';
import modalStore from '../stores/modalStore';
import {
    fetchCodeIntelligenceCapabilities,
    generateGitHubCodeIntelligenceReport,
    scanGitHubCodeIntelligence
} from '../utils/codeIntelligence';

const emptyForm = {
    token: '',
    owner: '',
    repo: '',
    ref: 'main',
    path: '',
    maxFiles: 200
};

const CodeIntelligenceModal = () => {
    const popNode = modalStore((s) => s.popNode);
    const [form, setForm] = useState(emptyForm);
    const [capabilities, setCapabilities] = useState(null);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [scanResult, setScanResult] = useState(null);
    const [report, setReport] = useState('');

    useEffect(() => {
        let mounted = true;
        fetchCodeIntelligenceCapabilities()
            .then((payload) => {
                if (mounted) {
                    setCapabilities(payload);
                }
            })
            .catch((capabilityError) => {
                if (mounted) {
                    setError(capabilityError.message || 'Could not load developer capabilities.');
                }
            });
        return () => {
            mounted = false;
        };
    }, []);

    const codeCapability =
        capabilities?.capabilities?.github_code_intelligence ||
        capabilities?.capabilities?.code_intelligence;
    const serverEnabled = Boolean(codeCapability?.enabled);
    const tokenEntered = Boolean(form.token.trim());
    const canRun = serverEnabled && tokenEntered && form.owner.trim() && form.repo.trim();
    const summary = useMemo(() => {
        if (!scanResult) {
            return null;
        }
        return {
            files: scanResult.files?.length || 0,
            nodes: scanResult.nodes?.length || 0,
            edges: scanResult.edges?.length || 0,
            findings: scanResult.findings?.length || 0
        };
    }, [scanResult]);

    const updateField = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const runScan = async () => {
        setError('');
        setStatus('Scanning GitHub repo...');
        setReport('');
        try {
            const result = await scanGitHubCodeIntelligence(form);
            setScanResult(result);
            setStatus('Scan complete.');
        } catch (scanError) {
            setStatus('');
            setError(scanError.message || 'GitHub scan failed.');
        }
    };

    const runReport = async () => {
        setError('');
        setStatus('Generating engineering report...');
        try {
            const markdown = await generateGitHubCodeIntelligenceReport(form);
            setReport(markdown);
            setStatus('Report generated.');
        } catch (reportError) {
            setStatus('');
            setError(reportError.message || 'Report generation failed.');
        }
    };

    return (
        <div className="modal-container code-intelligence-modal">
            <div className="title">
                <div>
                    <p>Code Intelligence</p>
                </div>
                <img src={CROSSSvg} alt="Close code intelligence" onClick={() => popNode()} />
            </div>
            <p className="settings-note">
                Developer-only local tool. GitHub tokens are sent only with this request and are not saved by TraceSpace.
            </p>
            {!serverEnabled ? (
                <p className="settings-warning">
                    Server capability is disabled. Set DOCMAP_ENABLE_CODE_INTELLIGENCE=true before scanning repositories.
                </p>
            ) : null}
            <div className="input-bar">
                <label htmlFor="github-token">GitHub token</label>
                <input
                    id="github-token"
                    type="password"
                    autoComplete="off"
                    value={form.token}
                    onChange={(event) => updateField('token', event.target.value)}
                />
            </div>
            <div className="settings-category-grid">
                <div className="input-bar">
                    <label htmlFor="github-owner">Owner</label>
                    <input
                        id="github-owner"
                        value={form.owner}
                        onChange={(event) => updateField('owner', event.target.value)}
                    />
                </div>
                <div className="input-bar">
                    <label htmlFor="github-repo">Repo</label>
                    <input
                        id="github-repo"
                        value={form.repo}
                        onChange={(event) => updateField('repo', event.target.value)}
                    />
                </div>
                <div className="input-bar">
                    <label htmlFor="github-ref">Branch/ref</label>
                    <input
                        id="github-ref"
                        value={form.ref}
                        onChange={(event) => updateField('ref', event.target.value)}
                    />
                </div>
                <div className="input-bar">
                    <label htmlFor="github-path">Folder scope optional</label>
                    <input
                        id="github-path"
                        value={form.path}
                        onChange={(event) => updateField('path', event.target.value)}
                    />
                </div>
            </div>
            <div className="input-bar">
                <label htmlFor="github-max-files">Max files</label>
                <input
                    id="github-max-files"
                    type="number"
                    min="1"
                    max="1000"
                    value={form.maxFiles}
                    onChange={(event) => updateField('maxFiles', Number(event.target.value))}
                />
            </div>
            <div className="buttons">
                <button id="cancel" type="button" onClick={() => popNode()}>
                    Close
                </button>
                <button id="scan-code" type="button" disabled={!canRun} onClick={runScan}>
                    Scan
                </button>
                <button id="report-code" type="button" disabled={!canRun} onClick={runReport}>
                    Report
                </button>
            </div>
            {status ? <p className="settings-saved">{status}</p> : null}
            {error ? <p className="settings-warning">{error}</p> : null}
            {summary ? (
                <section className="settings-section">
                    <div className="settings-section-title">
                        <div>
                            <strong>Scan summary</strong>
                            <span>
                                {summary.files} files | {summary.nodes} nodes | {summary.edges} relationships | {summary.findings} findings
                            </span>
                        </div>
                    </div>
                </section>
            ) : null}
            {report ? (
                <section className="settings-section">
                    <div className="settings-section-title">
                        <div>
                            <strong>Engineering report</strong>
                            <span>Markdown preview</span>
                        </div>
                    </div>
                    <pre className="code-intelligence-report">{report}</pre>
                </section>
            ) : null}
        </div>
    );
};

export default CodeIntelligenceModal;
