import assert from 'node:assert/strict';
import test from 'node:test';

// Never load real credentials into these tests, even when backend/.env exists.
process.env.INSTAGRAM_ACCESS_TOKEN = '';
process.env.INSTAGRAM_ACCOUNT_ID = '';
process.env.INSTAGRAM_API_HOST = 'graph.instagram.com';
process.env.OPENAI_API_KEY = '';
process.env.GEMINI_API_KEY = '';
const { config } = await import('../dist/config.js');
const { publishToInstagram } = await import('../dist/services/instagram.js');

function post(imageBase = 'https://media.example.com') {
  return {
    id: 'test-post',
    caption: 'Test caption',
    slides: [1, 2, 3].map((n) => ({ id: `slide_${n}`, imageUrl: `${imageBase}/${n}.png` })),
  };
}

test('missing credentials fail without making a request or claiming publication', async (t) => {
  config.instagramAccessToken = '';
  config.instagramAccountId = '';
  const fetchMock = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Network calls are forbidden in this test');
  });
  const result = await publishToInstagram(post());
  assert.equal(result.success, false);
  assert.equal(result.publishedId, undefined);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('localhost images fail without making a request or claiming publication', async (t) => {
  config.instagramAccessToken = 'test-token';
  config.instagramAccountId = '12345';
  const fetchMock = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Network calls are forbidden in this test');
  });
  const result = await publishToInstagram(post('http://127.0.0.1:3001'));
  assert.equal(result.success, false);
  assert.equal(result.publishedId, undefined);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('all publishing requests use the selected Instagram API host', async (t) => {
  config.instagramAccessToken = 'test-token';
  config.instagramAccountId = '12345';
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://graph.instagram.com');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.access_token, 'test-token');
    requests.push({ url, body });
    return Response.json({ id: `result-${requests.length}` });
  });
  const result = await publishToInstagram(post());
  assert.equal(requests.length, 5);
  assert.equal(requests[3].body.children, 'result-1,result-2,result-3');
  assert.equal(requests[4].url.pathname, '/v21.0/12345/media_publish');
  assert.equal(requests[4].body.creation_id, 'result-4');
  assert.equal(result.success, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.publishedId, 'result-5');
});

test('provider failure does not claim publication', async (t) => {
  config.instagramAccessToken = 'test-token';
  config.instagramAccountId = '12345';
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: { message: 'Synthetic provider rejection' } }, { status: 401 }),
  );
  const result = await publishToInstagram(post());
  assert.equal(result.success, false);
  assert.equal(result.publishedId, undefined);
});
