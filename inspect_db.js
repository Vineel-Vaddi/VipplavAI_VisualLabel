require('dotenv').config();
const { MongoClient } = require('mongodb');

async function inspectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);
  
  console.log('--- Collections ---');
  const collections = await db.listCollections().toArray();
  console.log(collections.map(c => c.name));

  const collectionsToInspect = ['images', 'annotations', 'users', 'work_items', 'debug_logs', 'image_files.files', 'image_files.chunks'];
  
  for (const colName of collectionsToInspect) {
    if (collections.find(c => c.name === colName)) {
      console.log(`\n--- ${colName} Indexes ---`);
      const indexes = await db.collection(colName).listIndexes().toArray();
      console.log(JSON.stringify(indexes, null, 2));

      console.log(`\n--- ${colName} Sample Document ---`);
      const sample = await db.collection(colName).findOne({});
      if (sample) {
          // Redact user or sensitive info just in case
          const keys = Object.keys(sample);
          console.log(`Fields: ${keys.join(', ')}`);
          if (sample.width !== undefined) {
             console.log(`Has width/height: ${sample.width}x${sample.height}`);
          }
      } else {
          console.log('Empty collection');
      }
    } else {
      console.log(`\n--- ${colName} NOT FOUND ---`);
    }
  }

  await client.close();
}

inspectDB().catch(console.error);
