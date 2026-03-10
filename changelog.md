# Changelog: VisionLabel Pro

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-03-09
### Added
- **Work Items Architecture**: Introduced a dedicated `work_items` collection to separate image metadata from user/session workflow state.
- **Batch Assignment API**: New `/api/work/assign` endpoint for atomic, multi-user safe image allocation.
- **Session-Based Tracking**: Implemented `session_id` to track labeling progress and ensure data integrity.
- **Performance Optimization**: Added comprehensive indexes and unique constraints to `work_items` for high-speed filtering and concurrency control.

### Changed
- **Schema Refactoring**: `images` collection is now metadata-only; all workflow states (assigned, skipped, completed) are moved to `work_items`.
- **Refactored Filters**: Labeler and Previewer filters now use the `work_items` collection for more reliable user isolation and status tracking.
- **Atomic Locking**: Improved image locking mechanism to prevent duplicate assignments across multiple simultaneous users.

## [1.3.0] - 2026-03-09
### Added
- **Source Selection Page**: New entry point for choosing between Local Folder and MongoDB.
- **Top Navigation Bar**: Persistent header with user info, source type, and dataset name.
- **Home Button**: Easy navigation back to the source selection screen.
- **User Notifications**: Real-time feedback for image assignment, skipping, and saving.
- **Data Loss Prevention**: Browser warning when leaving with unsaved annotations.

### Changed
- **Simplified Sidebar**: Removed redundant elements to focus on labeling tools.
- **MongoDB Workflow**: 
  - Images are assigned in batches of 100 (unlabeled and unassigned only).
  - Skip behavior: Only explicit skip button marks as skipped.
  - Done behavior: Marks as completed and releases assignment.
  - YOLO Export: Disabled until the "Done" button is pressed.
- **Filtering**: Consolidated and fixed filtering logic in both Labeler and Previewer.

## [1.2.0] - 2026-03-04
### Added
- **MongoDB Retry Mechanism**: New `/api/db/retry` endpoint to attempt reconnection without server restart.
- **Diagnostic UI**: Detailed error reporting and mitigation steps on the profile selection screen.
- **Local Mode Fallback**: Automatic switch to `localStorage` when MongoDB is unavailable, ensuring zero downtime for labeling.
- **Status Indicators**: Visual badges showing "Cloud Sync" vs "Local Mode" status.

### Fixed
- Improved database connection timeout handling (5s timeout) to prevent app hanging.
- Better error handling for user creation and fetch when DB is disconnected.

## [1.1.0] - 2026-03-03
### Added
- **MongoDB Integration**: Full backend support for storing images in GridFS and annotations in collections.
- **User Profiles**: Multi-user support with annotation tracking per user.
- **Dataset Management**: Ability to filter and organize images by dataset.

### Fixed
- **Bounding Box Drawing**: Switched to SVG-based annotation layer for precise coordinate mapping and reliable event handling.
- **Coordinate Scaling**: Fixed issues where boxes shifted when the window was resized.

## [1.0.0] - 2026-03-01
### Added
- Initial release of VisionLabel Pro.
- Basic bounding box drawing on Konva canvas.
- YOLO format export.
- Image status filtering (Labeled, Unlabeled, Skipped).
- Keyboard shortcuts for navigation.
