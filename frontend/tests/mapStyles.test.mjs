import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getMapStyleCanvasBackground,
    getMapStyleGridColor
} from '../src/utils/mapStyles.js';

test('clean map style follows app light and dark canvas modes', () => {
    assert.equal(getMapStyleCanvasBackground({ theme: 'clean' }, true), '#f8fafc');
    assert.equal(getMapStyleCanvasBackground({ theme: 'clean' }, false), '#1e1e1e');
    assert.equal(getMapStyleGridColor({ theme: 'clean' }, true), '#cbd5e1');
    assert.equal(getMapStyleGridColor({ theme: 'clean' }, false), '#3d3d3d');
});

test('non-clean map styles keep their explicit canvas backgrounds', () => {
    assert.equal(getMapStyleCanvasBackground({ theme: 'print' }, false), '#f8fafc');
    assert.equal(getMapStyleCanvasBackground({ theme: 'sketchbook' }, false), '#fbfaf4');
});
