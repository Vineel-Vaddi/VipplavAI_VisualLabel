# Setup Guide: VisionLabel Pro

Follow these steps to get VisionLabel Pro running on your local machine or server.

## 1. Prerequisites

- **Node.js**: Version 18 or higher.
- **npm**: Version 9 or higher.
- **MongoDB**: A running MongoDB instance (Local or MongoDB Atlas).

## 2. Environment Configuration

Create a `.env` file in the root directory. You can use `.env.example` as a template.

```env
# MongoDB Connection URI
# Example (Atlas): mongodb+srv://<user>:<password>@cluster.mongodb.net/
# Example (Local): mongodb://localhost:27017
MONGODB_URI="<your_mongodb_connection_string>"

# Database Name
MONGODB_DB_NAME="<your_database_name>"
```

### MongoDB Atlas Setup (Recommended)
1. Create a free cluster at [mongodb.com](https://www.mongodb.com/cloud/atlas).
2. Go to **Network Access** and add `0.0.0.0/0` (or your specific IP) to the whitelist.
3. Go to **Database Access** and create a user with `readWriteAnyDatabase` or specific permissions for your database.
4. Get your connection string from the **Connect** button.

## 3. Installation

Install the project dependencies:

```bash
npm install
```

## 4. Running the Application

### Development Mode
Runs the server with `tsx` and Vite middleware for hot module replacement.

```bash
npm run dev
```

### Production Mode
Builds the frontend and runs the optimized server.

```bash
npm run build
npm start
```

## 5. Troubleshooting Connection Issues

If the application starts but cannot connect to MongoDB:
1. The UI will automatically switch to **Local Mode** (storing data in your browser's `localStorage`).
2. Check the **Connection Error** message on the profile selection screen.
3. Follow the **Mitigation Steps** provided in the UI.
4. Once fixed, click **"Retry Cloud"** to attempt reconnection.

### Verifying Connection
You can check the database status by visiting:
`http://localhost:3000/api/health`

It will return a JSON response like:
```json
{
  "status": "ok",
  "db": true,
  "error": null
}
```

## 6. Data Population

To start labeling, you need images in your database.

### Option A: Web Upload
1. Open the application.
2. Go to the **Upload** section in the sidebar.
3. Select your image files and specify a dataset name.
4. Click **"Upload"**.

### Option B: Manual Import (Advanced)
If you have a large dataset, you can manually insert documents into the `images` collection. The application will automatically create `work_items` as users begin labeling.

**Image Metadata Schema (`images` collection):**
```json
{
  "image_id": "unique_string",
  "dataset": "dataset_name",
  "filename": "image.jpg",
  "gridfs_id": "ObjectId_of_file_in_GridFS",
  "width": 1920,
  "height": 1080,
  "created_at": "ISODate",
  "updated_at": "ISODate"
}
```

**Workflow Schema (`work_items` collection):**
The application manages this collection automatically to track user assignments and labeling progress.
```json
{
  "image_id": "unique_string",
  "dataset": "dataset_name",
  "user_id": "ObjectId_or_string",
  "session_id": "unique_session_id",
  "assignment_status": "assigned",
  "annotation_status": "unlabeled",
  "save_status": "not_saved",
  "is_skipped": false,
  "is_done_clicked": false,
  "is_uploaded_to_db": false,
  "assigned_at": "ISODate",
  "last_activity_at": "ISODate",
  "completed_at": null,
  "released_at": null,
  "lock_expires_at": "ISODate"
}
```
