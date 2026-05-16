import assert from 'node:assert/strict';
import test from 'node:test';

import { requestErrorMessage } from '../src/utils/requestErrors.js';

test('requestErrorMessage formats backend schema validation objects', () => {
    const message = requestErrorMessage({
        response: {
            data: {
                detail: {
                    message: 'AI graph output failed schema validation.',
                    errors: [
                        'nodes.0.data.title: must be a non-empty string',
                        'edges.0.source: must reference an existing node'
                    ]
                }
            }
        }
    });

    assert.equal(
        message,
        [
            'AI graph output failed schema validation.',
            'nodes.0.data.title: must be a non-empty string',
            'edges.0.source: must reference an existing node'
        ].join('\n')
    );
});

test('requestErrorMessage formats FastAPI validation arrays', () => {
    const message = requestErrorMessage({
        response: {
            data: {
                detail: [
                    {
                        loc: ['body', 'file'],
                        msg: 'Field required',
                        type: 'missing'
                    }
                ]
            }
        }
    });

    assert.equal(message, 'body.file: Field required');
});
