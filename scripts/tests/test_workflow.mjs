import test from 'node:test';
import assert from 'node:assert';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000/api';

test('Workflow Scenarios', async (t) => {
    // Shared state
    let user1Id, user2Id, session1, session2;
    let imageId1, imageId2;

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME;
    const client = await MongoClient.connect(uri);
    const db = client.db(dbName);
    const workItemsCollection = db.collection("work_items");
    const annotationsCollection = db.collection("annotations");

    await t.test('Scenario: Setup Test Users', async () => {
        const r1 = await fetch(`${BASE_URL}/users`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ name: 'wf_user_1_' + Date.now() }) });
        user1Id = (await r1.json())._id;

        const r2 = await fetch(`${BASE_URL}/users`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ name: 'wf_user_2_' + Date.now() }) });
        user2Id = (await r2.json())._id;
    });

    await t.test('Scenario 1: Normal labeling flow', async () => {
        // Assign work
        const assignRes = await fetch(`${BASE_URL}/work/assign`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ user_id: user1Id, limit: 2 }) });
        const assignData = await assignRes.json();
        if (assignData.count < 2) {
            console.log('Not enough images to test workflow. Skipping Scenario 1 tests.');
            return;
        }
        session1 = assignData.session_id;
        imageId1 = assignData.images[0].image_id;
        imageId2 = assignData.images[1].image_id;

        // Save annotation
        const saveRes = await fetch(`${BASE_URL}/annotations`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({
            image_id: imageId1,
            user_id: user1Id,
            session_id: session1,
            status: "labeled",
            boxes: [{ x_center: 0.1, y_center: 0.1, width: 0.1, height: 0.1 }]
        })});
        assert.strictEqual(saveRes.status, 200, "Should save successfully");

        // Verify DB State
        const wi = await workItemsCollection.findOne({ session_id: session1, image_id: imageId1 });
        assert.strictEqual(wi.annotation_status, "labeled");
        assert.strictEqual(wi.save_status, "db_saved");
    });

    await t.test('Scenario 2: Skip flow', async () => {
        if (!imageId2) return;
        const skipRes = await fetch(`${BASE_URL}/work/skip`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({
            image_id: imageId2,
            user_id: user1Id,
            session_id: session1
        })});
        assert.strictEqual(skipRes.status, 200);

        const wi = await workItemsCollection.findOne({ session_id: session1, image_id: imageId2 });
        assert.strictEqual(wi.is_skipped, true);
    });

    await t.test('Scenario 3: Annotation versioning', async () => {
        if (!imageId1) return;
        
        // Second save for same image
        const saveRes2 = await fetch(`${BASE_URL}/annotations`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({
            image_id: imageId1,
            user_id: user1Id,
            session_id: session1,
            status: "labeled",
            boxes: [{ x_center: 0.2, y_center: 0.2, width: 0.2, height: 0.2 }]
        })});
        const saveData = await saveRes2.json();
        assert.strictEqual(saveData.version, 2);

        // Verify DB state
        const ann1 = await annotationsCollection.findOne({ image_id: imageId1, version: 1 });
        assert.strictEqual(ann1.is_latest, false);

        const ann2 = await annotationsCollection.findOne({ image_id: imageId1, version: 2 });
        assert.strictEqual(ann2.is_latest, true);
    });

    await t.test('Scenario 4: Session protection', async () => {
        if (!imageId1) return;
        const fakeSession = "invalid_session_123";
        const saveRes = await fetch(`${BASE_URL}/annotations`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({
            image_id: imageId1,
            user_id: user1Id,
            session_id: fakeSession,
            status: "labeled",
            boxes: []
        })});
        assert.strictEqual(saveRes.status, 403, "Should reject unassigned image for this session");
    });

    await t.test('Scenario 6: Multi-user assignment safety', async () => {
        // Run assign concurrently to see if they get disjoint datasets
        const [res1, res2] = await Promise.all([
            fetch(`${BASE_URL}/work/assign`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ user_id: user1Id, limit: 5 }) }),
            fetch(`${BASE_URL}/work/assign`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ user_id: user2Id, limit: 5 }) })
        ]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        // Ensure no intersection
        const ids1 = new Set((data1.images||[]).map(i => i.image_id));
        const intersection = (data2.images||[]).filter(i => ids1.has(i.image_id));
        assert.strictEqual(intersection.length, 0, "Users should not be assigned the same images");
    });

    await t.test('Scenario 5: Expired assignment handling', async () => {
        // Hack the lock_expires_at in DB directly for session1 items
        await workItemsCollection.updateMany({ session_id: session1 }, { $set: { lock_expires_at: new Date(Date.now() - 100000) } });
        
        // Let's release explicitly by calling the endpoint that internally releases expired (e.g. /api/debug/work/release-expired)
        const relRes = await fetch(`${BASE_URL}/debug/work/release-expired`, { method: 'POST' });
        const relData = await relRes.json();
        
        // Assert some were released, and their statuses are "released". Actually, workItems assigned in prior tests would be released.
        // We verify the status in DB directly.
        const releasedWi = await workItemsCollection.findOne({ session_id: session1, assignment_status: "released" });
        assert.ok(releasedWi !== null, "Should have marked expired lock as released");
    });

    await t.test('Cleanup / Done', async () => {
        // Call done for user1 to clean up
        await fetch(`${BASE_URL}/work/done`, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ user_id: user1Id, session_id: session1 }) });
        await client.close();
    });
});
