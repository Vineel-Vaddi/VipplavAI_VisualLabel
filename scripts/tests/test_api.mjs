import test from 'node:test';
import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000/api';

let testUserId = '';
let sessionId = '';
let assignedImages = [];

test('A. GET /api/health', async (t) => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.db, true);
});

test('C. POST /api/users - Create test user', async (t) => {
    const res = await fetch(`${BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test_qa_user_' + Date.now() })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data._id);
    testUserId = data._id;
});

test('B. GET /api/users - Verify user in list', async (t) => {
    const res = await fetch(`${BASE_URL}/users`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.some(u => u._id === testUserId));
});

test('D. POST /api/work/assign - Assign work', async (t) => {
    const res = await fetch(`${BASE_URL}/work/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: testUserId, limit: 3 })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.session_id);
    assert.ok(Array.isArray(data.images));
    sessionId = data.session_id;
    assignedImages = data.images;
    // We may get 0 images if DB is empty, but we verify response shape
});

test('E. GET /api/images - Fetch assigned images using session', async (t) => {
    if (assignedImages.length === 0) return; // Skip if no images
    const res = await fetch(`${BASE_URL}/images?user_id=${testUserId}&session_id=${sessionId}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, assignedImages.length);
});

test('F. GET /api/images/gridfs/:gridfsId', async (t) => {
    if (assignedImages.length === 0 || !assignedImages[0].gridfs_id) return;
    const gridfsId = assignedImages[0].gridfs_id;
    const res = await fetch(`${BASE_URL}/images/gridfs/${gridfsId}`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.startsWith('image/'));
    const buffer = await res.arrayBuffer();
    assert.ok(buffer.byteLength > 0);
});

test('I. POST /api/work/heartbeat', async (t) => {
    if (!sessionId) return;
    const res = await fetch(`${BASE_URL}/work/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: testUserId, session_id: sessionId })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, 'Heartbeat successful');
});

test('H. POST /api/annotations', async (t) => {
    if (assignedImages.length === 0) return;
    const imageId = assignedImages[0].image_id;
    const payload = {
        image_id: imageId,
        boxes: [{ x_center: 0.5, y_center: 0.5, width: 0.1, height: 0.1, label: "test" }],
        user_id: testUserId,
        status: "in_progress",
        session_id: sessionId
    };
    const res = await fetch(`${BASE_URL}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.message, 'Saved successfully');
});

test('J. POST /api/work/skip', async (t) => {
    if (assignedImages.length < 2) return;
    const imageId = assignedImages[1].image_id;
    const res = await fetch(`${BASE_URL}/work/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_id: imageId, user_id: testUserId, session_id: sessionId })
    });
    assert.strictEqual(res.status, 200);
});

test('K. POST /api/work/done', async (t) => {
    if (!sessionId) return;
    const res = await fetch(`${BASE_URL}/work/done`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: testUserId, session_id: sessionId })
    });
    assert.strictEqual(res.status, 200);
});

test('M. GET /api/stats', async (t) => {
    const res = await fetch(`${BASE_URL}/stats`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.total !== undefined);
    assert.ok(data.labeled !== undefined);
    assert.ok(data.inProgress !== undefined);
});
