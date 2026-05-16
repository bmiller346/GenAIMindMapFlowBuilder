import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeGitHubCodeIntelligenceForm,
    redactGitHubToken,
    scanGitHubCodeIntelligence
} from '../src/utils/codeIntelligence.js';

test('normalizes GitHub code intelligence request form', () => {
    const normalized = normalizeGitHubCodeIntelligenceForm({
        token: '  ghp_SECRET_SENTINEL_123  ',
        owner: '/org/',
        repo: '/repo/',
        ref: '',
        path: '/src/app/',
        changedPaths: 'src/app.py\n/backend/service.py',
        maxFiles: 5000
    });

    assert.deepEqual(normalized, {
        token: 'ghp_SECRET_SENTINEL_123',
        owner: 'org',
        repo: 'repo',
        ref: 'main',
        path: 'src/app',
        changedPaths: ['src/app.py', 'backend/service.py'],
        maxFiles: 1000
    });
});

test('rejects missing GitHub token or repo coordinates before request', () => {
    assert.throws(
        () => normalizeGitHubCodeIntelligenceForm({ owner: 'org', repo: 'repo' }),
        /GitHub token is required/
    );
    assert.throws(
        () => normalizeGitHubCodeIntelligenceForm({ token: 'token', owner: 'org' }),
        /GitHub owner and repo are required/
    );
});

test('sends GitHub token only as request header', async () => {
    const calls = [];
    global.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            ok: true,
            json: async () => ({ source_type: 'github_repo' })
        };
    };

    await scanGitHubCodeIntelligence({
        token: 'ghp_SECRET_SENTINEL_123',
        owner: 'org',
        repo: 'repo',
        ref: 'main',
        path: 'src',
        changedPaths: 'src/app.py'
    });

    const body = JSON.parse(calls[0].options.body);
    assert.equal(calls[0].options.headers['x-docmap-github-token'], 'ghp_SECRET_SENTINEL_123');
    assert.equal(body.owner, 'org');
    assert.equal(body.repo, 'repo');
    assert.equal(body.path, 'src');
    assert.deepEqual(body.changed_paths, ['src/app.py']);
    assert.equal(JSON.stringify(body).includes('ghp_SECRET_SENTINEL_123'), false);
});

test('redacts GitHub token from surfaced errors', () => {
    const redacted = redactGitHubToken(
        'Request failed for ghp_SECRET_SENTINEL_123',
        'ghp_SECRET_SENTINEL_123'
    );

    assert.equal(redacted, 'Request failed for [redacted-github-token]');
});
