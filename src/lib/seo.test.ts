import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLdHtml } from './seo';

test('jsonLdHtml escapes script-breaking characters but stays valid JSON', () => {
  const obj = { name: 'Oak Tile </script><script>alert(1)</script>', note: 'a & b', sep: 'x y' };
  const out = jsonLdHtml(obj);

  // No raw script delimiters can survive to break out of the <script> element.
  assert.ok(!/<\/script/i.test(out), 'no raw </script');
  assert.ok(!out.includes('<script'), 'no raw <script');
  assert.ok(!out.includes(' '), 'raw line separator escaped');

  // The \uXXXX escapes are valid JSON, so it parses straight back to the input.
  assert.deepEqual(JSON.parse(out), obj);
});
