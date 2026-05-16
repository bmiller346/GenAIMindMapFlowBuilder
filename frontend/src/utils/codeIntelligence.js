const API_BASE = 'http://localhost:8000';

export const redactGitHubToken = (value, token = '') => {
    const raw = String(value ?? '');
    const trimmedToken = String(token || '').trim();
    if (!trimmedToken) {
        return raw;
    }
    return raw.split(trimmedToken).join('[redacted-github-token]');
};

export const normalizeGitHubCodeIntelligenceForm = ({
    token = '',
    owner = '',
    repo = '',
    ref = 'main',
    path = '',
    changedPaths = '',
    maxFiles = 500
} = {}) => {
    const normalizedChangedPaths = Array.isArray(changedPaths)
        ? changedPaths
        : String(changedPaths || '').split(/\r?\n|,/);
    const normalized = {
        token: String(token || '').trim(),
        owner: String(owner || '').trim().replace(/^\/+|\/+$/g, ''),
        repo: String(repo || '').trim().replace(/^\/+|\/+$/g, ''),
        ref: String(ref || '').trim() || 'main',
        path: String(path || '').trim().replace(/^\/+|\/+$/g, ''),
        changedPaths: normalizedChangedPaths
            .map((item) => String(item || '').trim().replace(/^\/+|\/+$/g, ''))
            .filter(Boolean),
        maxFiles: Math.max(1, Math.min(5000, Number(maxFiles) || 500))
    };

    if (normalized.owner.includes('/')) {
        const [ownerPart, repoPart] = normalized.owner.split('/');
        normalized.owner = ownerPart || '';
        normalized.repo = normalized.repo || repoPart || '';
    }

    if (!normalized.token) {
        throw new Error('GitHub token is required.');
    }
    if (!normalized.owner || !normalized.repo) {
        throw new Error('GitHub owner and repo are required.');
    }
    return normalized;
};

const parseError = async (response) => {
    try {
        const payload = await response.json();
        if (payload?.detail?.message) {
            return payload.detail.message;
        }
        return payload?.detail || response.statusText || 'Request failed.';
    } catch {
        return response.statusText || 'Request failed.';
    }
};

export const fetchCodeIntelligenceCapabilities = async () => {
    const response = await fetch(`${API_BASE}/api/capabilities`);
    if (!response.ok) {
        throw new Error(await parseError(response));
    }
    return response.json();
};

export const scanGitHubCodeIntelligence = async ({
    token,
    owner,
    repo,
    ref = 'main',
    path = '',
    changedPaths = '',
    maxFiles = 500
}) => {
    const normalized = normalizeGitHubCodeIntelligenceForm({
        token,
        owner,
        repo,
        ref,
        path,
        changedPaths,
        maxFiles
    });
    const response = await fetch(`${API_BASE}/api/code-intelligence/github/scan`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-docmap-github-token': normalized.token
        },
        body: JSON.stringify({
            owner: normalized.owner,
            repo: normalized.repo,
            ref: normalized.ref,
            path: normalized.path,
            changed_paths: normalized.changedPaths,
            max_files: normalized.maxFiles
        })
    });
    if (!response.ok) {
        throw new Error(redactGitHubToken(await parseError(response), normalized.token));
    }
    return response.json();
};

export const generateGitHubCodeIntelligenceReport = async ({
    token,
    owner,
    repo,
    ref = 'main',
    path = '',
    changedPaths = '',
    maxFiles = 500
}) => {
    const normalized = normalizeGitHubCodeIntelligenceForm({
        token,
        owner,
        repo,
        ref,
        path,
        changedPaths,
        maxFiles
    });
    const response = await fetch(`${API_BASE}/api/code-intelligence/github/report.md`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-docmap-github-token': normalized.token
        },
        body: JSON.stringify({
            owner: normalized.owner,
            repo: normalized.repo,
            ref: normalized.ref,
            path: normalized.path,
            changed_paths: normalized.changedPaths,
            max_files: normalized.maxFiles
        })
    });
    if (!response.ok) {
        throw new Error(redactGitHubToken(await parseError(response), normalized.token));
    }
    return response.text();
};

export const generateGitHubCodeIntelligenceArtifacts = async ({
    token,
    owner,
    repo,
    ref = 'main',
    path = '',
    changedPaths = '',
    maxFiles = 500
}) => {
    const normalized = normalizeGitHubCodeIntelligenceForm({
        token,
        owner,
        repo,
        ref,
        path,
        changedPaths,
        maxFiles
    });
    const response = await fetch(`${API_BASE}/api/code-intelligence/github/artifacts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-docmap-github-token': normalized.token
        },
        body: JSON.stringify({
            owner: normalized.owner,
            repo: normalized.repo,
            ref: normalized.ref,
            path: normalized.path,
            changed_paths: normalized.changedPaths,
            max_files: normalized.maxFiles
        })
    });
    if (!response.ok) {
        throw new Error(redactGitHubToken(await parseError(response), normalized.token));
    }
    return response.json();
};
