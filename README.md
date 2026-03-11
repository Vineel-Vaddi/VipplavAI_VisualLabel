# VisionLabel Pro

Professional image labeling tool for bounding box annotation, designed for high-performance traffic violation datasets.

## 🚀 Key Features
- **Multi-Class Support**: helmet, no_helmet, bike_number_plate, car_number_plate.
- **Hybrid Storage**: 
  - **Cloud Sync**: MongoDB (GridFS) for team collaboration.
  - **Local Mode**: Automatic fallback to `localStorage` if the database is offline.
- **YOLO Export**: Download annotations in YOLO format with `data.yaml` and organized directory structure.
- **Real-time Diagnostics**: Built-in connection monitoring with actionable mitigation steps for database issues.
- **Modern UX**: SVG-based annotation layer with sub-pixel precision, drag-and-drop, and keyboard shortcuts.

## 📖 Documentation
- [**Setup Guide**](./setup.md): Detailed instructions on environment variables and database configuration.
- [**Changelog**](./changelog.md): History of features, fixes, and improvements.

## 🔧 Netlify Deployment Fix Summary
Recently, the application was adapted for Netlify deployment. The following deployment issues were resolved:
- **Root Cause**: The Netlify API redirect rule stripped the subpath, causing all API calls to return 404s. Additionally, the backend used an incorrect placeholder fallback DB name instead of the production DB name.
- **What was corrected**: 
  - Updated `netlify.toml` redirect from `to = "/.netlify/functions/api"` to `to = "/.netlify/functions/api/:splat"` to properly preserve API subpaths.
  - Restored the fallback database name to `traffic_violation`.
  - Fixed a race condition in `server.ts` where multiple database connections could be established in the serverless environment.
  - Enhanced `/api/health` to safely check if the `MONGODB_URI` string is present and print the resolved database name.
- **Netlify Configuration**: Ensure you set `MONGODB_URI` and optionally `MONGODB_DB_NAME` in your Netlify site UI Environment Variables.

## 🖱️ How to Use

### 1. Profile Selection
- When you first open the app, you'll be prompted to select or create a profile.
- **Cloud Sync**: If your database is connected, your profile and progress are synced across devices.
- **Local Mode**: If the database is unreachable, your profile is stored in your browser's `localStorage`.

### 2. Labeler Workflow
- **Select an Image**: Use the sidebar to browse images. You can filter by status (Unlabeled, Labeled, etc.).
- **Draw Boxes**: Click and drag on the image to create a bounding box.
- **Assign Class**: Select a box and choose its class (e.g., Helmet) from the sidebar or use number keys `1-4`.
- **Adjust Boxes**: Click and drag a box to move it, or use the handles to resize.
- **Save Progress**: Click **"Save DB"** to store your annotations to MongoDB.
- **Skip**: Click **"Skip"** to mark an image as skipped. Navigation buttons do NOT trigger a skip.
- **Complete**: Click **"Done"** to finalize the image. This marks it as `completed` and releases it from your assignment.
- **YOLO Export**: The **"YOLO"** download button is enabled only after clicking **"Done"**.

### 3. Navigation & Home
- **Home Button**: Use the Home button in the top navigation bar to return to the Source Selection page.
- **Source Selection**: Choose between "Load Local Folder" or "Connect MongoDB" from the home screen.
- **User Profile**: Switch your active profile using the edit icon next to your username in the top bar.

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB (Atlas or Local)

### 2. Installation
```bash
npm install
```

### 3. Configuration
Create a `.env` file (see `.env.example` for reference):
```env
MONGODB_URI="<your_mongodb_connection_string>"
MONGODB_DB_NAME="<your_database_name>"
```

### 4. Run
```bash
npm run dev
```
Open `http://localhost:3000`.

## 📦 MongoDB Workflow

### Image Assignment (Work Items)
- **Dedicated Collection**: The app now uses a `work_items` collection to separate image metadata from user workflow state.
- **Batch Loading**: When connecting to MongoDB, the app creates a new `session_id` and assigns up to 100 `unlabeled` and `unassigned` images to your profile.
- **Atomic Locking**: Images are locked to your session using a partial unique index on `image_id` where `assignment_status` is `assigned`.
- **Concurrency**: Images assigned to you are hidden from other users to ensure no duplicate work occurs.

### Status Tracking
- **Workflow**: Images move through the following states in `work_items`:
  - `assignment_status`: `assigned` → `completed` (when Done is pressed) or `released`.
  - `annotation_status`: `unlabeled` → `in_progress` → `labeled`.
  - `save_status`: `not_saved` → `db_saved`.
- **Skip Behavior**: Only the explicit **Skip** button marks an image as skipped in the `work_items` collection.
- **Session Persistence**: If you leave the page with unsaved changes, a browser warning will appear.

### Performance
- **Indexed Queries**: The `work_items` collection is heavily indexed on `user_id`, `session_id`, `dataset`, and `assignment_status` for fast filtering and retrieval.

## 🚀 Deployment & App Architecture

### Netlify Serverless Routing
When deploying to Netlify, API routing is handled by mapping `/api/*` requests to an Express app via the `netlify/functions/api.ts` serverless wrapper. **Crucially**, the `netlify.toml` configuration requires the `/:splat` redirect (`to = "/.netlify/functions/api/:splat"`) so that dynamic Express routes receive the correct original path.

### Image Retrieval (MongoDB/GridFS)
Since images can be large, they are stored in MongoDB using `GridFS`. The frontend fetches structural metadata from the `images` collection, and uses the `gridfs_id` to reliably stream the raw binary content via the robust `/api/images/gridfs/:gridfsId` endpoint, which is designed to handle serverless chunked streaming correctly.

**Known Deployment Pitfalls:**
- Missing the `/:splat` redirect rule in `netlify.toml`.
- Forgetting to configure `MONGODB_URI` in the cloud environment provider's settings.
- Netlify functions have a strict execution timeout (usually 10s on the free tier) which GridFS parsing must complete within.
