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
MONGODB_URI="mongodb+srv://..."
MONGODB_DB_NAME="traffic_violation"
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
