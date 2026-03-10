import express from "express";

import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import dotenv from "dotenv";
import multer from "multer";
import { Readable } from "stream";

dotenv.config();

const app = express();
const PORT = 3000;

// Read these dynamically inside functions later if undefined here
let getMongoUri = () => process.env.MONGODB_URI;
let getDbName = () => process.env.MONGODB_DB_NAME || "your_database_name";


app.use(express.json({ limit: '50mb' }));

// Middleware to check DB connection
app.use((req, res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health" && !db) {
    return res.status(503).json({
      error: "Database not connected",
      details: "The server is unable to connect to MongoDB. Please check your connection string."
    });
  }
  next();
});

let db: any;
let lastDbError: string | null = null;
let imagesCollection: any;
let annotationsCollection: any;
let usersCollection: any;
let workItemsCollection: any;
let bucket: GridFSBucket;

async function connectDB() {
  try {
    const uri = getMongoUri();
    const dbName = getDbName();

    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not defined");
    }
    console.log("Connecting to MongoDB...");
    lastDbError = null;
    const client = await MongoClient.connect(uri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });
    // Store db in req context? No, just keep the global db connection 
    // to reuse across lambda executions if possible.
    if (db) return; // Prevent multiple connections

    db = client.db(dbName);
    imagesCollection = db.collection("images");
    annotationsCollection = db.collection("annotations");
    usersCollection = db.collection("users");
    workItemsCollection = db.collection("work_items");
    bucket = new GridFSBucket(db, { bucketName: "image_files" });
    console.log(`Connected to MongoDB: ${dbName}`);

    // Create indexes
    await imagesCollection.createIndex({ image_id: 1 }, { unique: true });
    await imagesCollection.createIndex({ dataset: 1, filename: 1 }, { unique: true });

    await annotationsCollection.createIndex({ image_id: 1, is_latest: 1 });
    await annotationsCollection.createIndex({ user_id: 1 });

    await usersCollection.createIndex({ name: 1 }, { unique: true });

    // work_items indexes
    await workItemsCollection.createIndex({ image_id: 1, assignment_status: 1 });
    await workItemsCollection.createIndex({ user_id: 1, session_id: 1 });
    await workItemsCollection.createIndex({ user_id: 1, annotation_status: 1 });
    await workItemsCollection.createIndex({ dataset: 1, assignment_status: 1, annotation_status: 1 });
    await workItemsCollection.createIndex({ lock_expires_at: 1 });
    // Unique constraint: an image can only have ONE active assignment (assigned status)
    await workItemsCollection.createIndex(
      { image_id: 1 },
      {
        unique: true,
        partialFilterExpression: { assignment_status: "assigned" }
      }
    );
  } catch (err: any) {
    lastDbError = err.message;
    console.error("Failed to connect to MongoDB:", err.message);
    // Don't crash the server, but log the failure
  }
}

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// API Routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    db: !!db,
    error: lastDbError,
    mitigation: lastDbError ? [
      "Check if MONGODB_URI is correct in .env",
      "Ensure your IP is whitelisted in MongoDB Atlas",
      "Check if the database user has correct permissions",
      "Verify that the cluster is active and not paused"
    ] : null
  });
});

app.post("/api/db/retry", async (req, res) => {
  if (db) return res.json({ status: "already_connected" });
  await connectDB();
  res.json({
    status: db ? "connected" : "failed",
    error: lastDbError
  });
});

// User Routes
app.get("/api/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (err: any) {
    console.error("Fetch users error:", err.message);
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const existing = await usersCollection.findOne({ name });
    if (existing) return res.json(existing);

    const newUser = {
      name,
      created_at: new Date(),
      total_annotations: 0
    };

    const result = await usersCollection.insertOne(newUser);
    res.json({ ...newUser, _id: result.insertedId });
  } catch (err: any) {
    console.error("Create user error:", err.message);
    res.status(500).json({ error: "Failed to create user", details: err.message });
  }
});

// Get images with pagination/status/dataset
app.get("/api/images", async (req, res) => {
  try {
    const { status, dataset, limit = 100, skip = 0, user_id, session_id } = req.query;

    // If user_id and session_id are provided, we fetch from work_items
    if (user_id && session_id) {
      const workItems = await workItemsCollection.find({
        user_id,
        session_id,
        assignment_status: "assigned"
      }).toArray();

      const imageIds = workItems.map((wi: any) => wi.image_id);
      const images = await imagesCollection.find({ image_id: { $in: imageIds } }).toArray();

      // Merge work item status into image docs
      const merged = images.map((img: any) => {
        const wi = workItems.find((w: any) => w.image_id === img.image_id);
        return {
          ...img,
          status: wi.is_skipped ? "skipped" : (wi.annotation_status === "labeled" ? "completed" : (wi.annotation_status === "in_progress" ? "in_progress" : "unlabeled")),
          workItem: wi
        };
      });

      return res.json(merged);
    }

    // Otherwise, generic fetch (for previewer)
    const query: any = {};
    if (dataset) query.dataset = dataset;

    // For previewer, we might want to join with work_items to show status
    const images = await imagesCollection
      .find(query)
      .sort({ created_at: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();

    // Fetch work items for these images to get status
    const imageIds = images.map((img: any) => img.image_id);
    const workItems = await workItemsCollection.find({ image_id: { $in: imageIds } }).toArray();

    const merged = images.map((img: any) => {
      // Find the most relevant work item (e.g. completed or assigned)
      const wi = workItems.find((w: any) => w.image_id === img.image_id && (w.assignment_status === "completed" || w.assignment_status === "assigned"));
      return {
        ...img,
        status: wi ? (wi.is_skipped ? "skipped" : (wi.annotation_status === "labeled" ? "completed" : "in_progress")) : "unlabeled",
        workItem: wi
      };
    });

    res.json(merged);
  } catch (err) {
    console.error("Fetch images error:", err);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// Get single image metadata by image_id
app.get("/api/images/:imageId", async (req, res) => {
  try {
    const image = await imagesCollection.findOne({ image_id: req.params.imageId });
    if (!image) return res.status(404).json({ error: "Image not found" });
    res.json(image);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch image metadata" });
  }
});

// Get single image data by image_id
app.get("/api/images/:imageId/data", async (req, res) => {
  try {
    const image = await imagesCollection.findOne({ image_id: req.params.imageId });
    if (!image || !image.gridfs_id) {
      return res.status(404).json({ error: "Image not found" });
    }

    const downloadStream = bucket.openDownloadStream(new ObjectId(image.gridfs_id));
    res.set("Content-Type", image.mime_type || "image/jpeg");
    downloadStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch image data" });
  }
});

// Batch assignment logic
app.post("/api/work/assign", async (req, res) => {
  try {
    const { user_id, dataset, limit = 100 } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id is required" });

    const session_id = new ObjectId().toString();

    // Find images that are not already assigned/completed/skipped in ANY work_item
    // This is a bit tricky. We want images that don't have an 'assigned' or 'completed' work_item.

    // 1. Get all image_ids that have active or completed work items
    const unavailableWorkItems = await workItemsCollection.find({
      $or: [
        { assignment_status: "assigned" },
        { assignment_status: "completed" },
        { is_skipped: true }
      ]
    }, { projection: { image_id: 1 } }).toArray();

    const unavailableImageIds = unavailableWorkItems.map((wi: any) => wi.image_id);

    // 2. Find images not in that list
    const query: any = { image_id: { $nin: unavailableImageIds } };
    if (dataset) query.dataset = dataset;

    const availableImages = await imagesCollection
      .find(query)
      .limit(Number(limit))
      .toArray();

    if (availableImages.length === 0) {
      return res.json({ session_id, count: 0, images: [] });
    }

    // 3. Create work_items for these images
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h lock

    const workItems = availableImages.map((img: any) => ({
      image_id: img.image_id,
      dataset: img.dataset || "default",
      user_id,
      session_id,
      assignment_status: "assigned",
      annotation_status: "unlabeled",
      save_status: "not_saved",
      is_skipped: false,
      is_done_clicked: false,
      is_uploaded_to_db: false,
      assigned_at: now,
      last_activity_at: now,
      completed_at: null,
      released_at: null,
      lock_expires_at: lockExpiresAt
    }));

    // Use insertMany with ordered: false to handle potential race conditions gracefully
    // though the $nin check above should minimize them.
    try {
      await workItemsCollection.insertMany(workItems, { ordered: false });
    } catch (err: any) {
      // If some failed due to unique constraint (race condition), we just continue with what succeeded
      console.warn("Some work items failed to insert (likely race condition):", err.message);
    }

    // Fetch what actually got assigned to THIS session
    const assignedWorkItems = await workItemsCollection.find({ session_id, user_id }).toArray();
    const assignedImageIds = assignedWorkItems.map((wi: any) => wi.image_id);
    const assignedImages = await imagesCollection.find({ image_id: { $in: assignedImageIds } }).toArray();

    // Merge status
    const merged = assignedImages.map((img: any) => {
      const wi = assignedWorkItems.find((w: any) => w.image_id === img.image_id);
      return {
        ...img,
        status: "unlabeled",
        workItem: wi
      };
    });

    res.json({ session_id, count: merged.length, images: merged });
  } catch (err: any) {
    console.error("Batch assignment error:", err);
    res.status(500).json({ error: "Failed to assign work items", details: err.message });
  }
});

// Skip endpoint
app.post("/api/work/skip", async (req, res) => {
  try {
    const { image_id, user_id, session_id } = req.body;
    if (!image_id || !user_id || !session_id) return res.status(400).json({ error: "Missing required fields" });

    const result = await workItemsCollection.updateOne(
      { image_id, user_id, session_id, assignment_status: "assigned" },
      {
        $set: {
          is_skipped: true,
          last_activity_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Work item not found or not assigned to you" });
    res.json({ message: "Marked as skipped" });
  } catch (err) {
    res.status(500).json({ error: "Failed to skip image" });
  }
});

// Done endpoint
app.post("/api/work/done", async (req, res) => {
  try {
    const { session_id, user_id } = req.body;
    if (!session_id || !user_id) return res.status(400).json({ error: "Missing required fields" });

    const now = new Date();
    // Mark all assigned items in this session as completed
    await workItemsCollection.updateMany(
      { session_id, user_id, assignment_status: "assigned" },
      {
        $set: {
          assignment_status: "completed",
          is_done_clicked: true,
          completed_at: now,
          last_activity_at: now
        }
      }
    );

    res.json({ message: "Session completed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete session" });
  }
});

// Assign image to user (Locking) by image_id - DEPRECATED in favor of batch assign
app.post("/api/images/:imageId/assign", async (req, res) => {
  res.status(410).json({ error: "This endpoint is deprecated. Use /api/work/assign instead." });
});

// Upload images
app.post("/api/images/upload", upload.array("files"), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { dataset = "default" } = req.body;
    const results = [];

    for (const file of files) {
      const uploadStream = bucket.openUploadStream(file.originalname);
      const readableStream = new Readable();
      readableStream.push(file.buffer);
      readableStream.push(null);

      await new Promise((resolve, reject) => {
        readableStream.pipe(uploadStream)
          .on("finish", resolve)
          .on("error", reject);
      });

      const imageDoc = {
        image_id: new ObjectId().toString(),
        source: "upload",
        dataset,
        filename: file.originalname,
        gridfs_id: uploadStream.id,
        status: "unlabeled",
        width: 0, // Should be updated on first load
        height: 0,
        created_at: new Date(),
        updated_at: new Date()
      };

      await imagesCollection.insertOne(imageDoc);
      results.push(imageDoc);
    }

    res.json({ message: "Uploaded successfully", count: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload images" });
  }
});

// Get unique datasets
app.get("/api/datasets", async (req, res) => {
  try {
    const datasets = await imagesCollection.distinct("dataset");
    res.json(datasets.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch datasets" });
  }
});

// Get annotations (latest by default)
app.get("/api/annotations/:imageId", async (req, res) => {
  try {
    const annotation = await annotationsCollection.findOne({
      image_id: req.params.imageId,
      is_latest: true
    });
    res.json(annotation || { image_id: req.params.imageId, boxes: [] });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch annotations" });
  }
});

// Save annotations with versioning
app.post("/api/annotations", async (req, res) => {
  try {
    const { image_id, boxes, user_id, status, session_id } = req.body;

    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    if (!image_id) return res.status(400).json({ error: "image_id is required" });

    // Validate boxes
    if (!Array.isArray(boxes)) return res.status(400).json({ error: "boxes must be an array" });
    for (const box of boxes) {
      if (typeof box.x_center !== 'number' || box.x_center < 0 || box.x_center > 1) return res.status(400).json({ error: "Invalid x_center" });
      if (typeof box.y_center !== 'number' || box.y_center < 0 || box.y_center > 1) return res.status(400).json({ error: "Invalid y_center" });
      if (typeof box.width !== 'number' || box.width <= 0 || box.width > 1) return res.status(400).json({ error: "Invalid width" });
      if (typeof box.height !== 'number' || box.height <= 0 || box.height > 1) return res.status(400).json({ error: "Invalid height" });
    }

    // Check if image exists
    const image = await imagesCollection.findOne({ image_id });
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Check work item if session_id is provided
    if (session_id) {
      const workItem = await workItemsCollection.findOne({ image_id, user_id, session_id, assignment_status: "assigned" });
      if (!workItem) return res.status(403).json({ error: "Image not assigned to you in this session" });
    }

    // Get current version
    const latestAnnotation = await annotationsCollection.findOne({ image_id, is_latest: true });
    const nextVersion = latestAnnotation ? (latestAnnotation.version + 1) : 1;

    // Set previous latest to false
    if (latestAnnotation) {
      await annotationsCollection.updateOne(
        { _id: latestAnnotation._id },
        { $set: { is_latest: false } }
      );
    }

    const newAnnotation = {
      image_id,
      user_id,
      version: nextVersion,
      is_latest: true,
      boxes,
      source: "manual_labeling",
      created_at: new Date(),
      updated_at: new Date()
    };

    await annotationsCollection.insertOne(newAnnotation);

    // Update work item status
    if (session_id) {
      await workItemsCollection.updateOne(
        { image_id, user_id, session_id, assignment_status: "assigned" },
        {
          $set: {
            annotation_status: status === "labeled" ? "labeled" : "in_progress",
            save_status: "db_saved",
            is_uploaded_to_db: true,
            last_activity_at: new Date()
          }
        }
      );
    }

    // Update user stats
    if (status === "labeled") {
      await usersCollection.updateOne(
        { _id: new ObjectId(user_id) },
        { $inc: { total_annotations: 1 } }
      );
    }

    res.json({ message: "Saved successfully", version: nextVersion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save annotations" });
  }
});

// Stats
app.get("/api/stats", async (req, res) => {
  try {
    const total = await imagesCollection.countDocuments();

    // Labeled is now derived from work_items with annotation_status: labeled
    const labeled = await workItemsCollection.countDocuments({ annotation_status: "labeled" });
    const inProgress = await workItemsCollection.countDocuments({ annotation_status: "in_progress", assignment_status: "assigned" });
    const skipped = await workItemsCollection.countDocuments({ is_skipped: true });

    res.json({ total, labeled, inProgress, skipped, unlabeled: total - labeled - skipped });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Avoid unhandled promise rejections
export { app, connectDB };

if (process.env.NODE_ENV !== "production" && !process.env.NETLIFY) {
  async function startServer() {
    await connectDB();
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  startServer();
}
