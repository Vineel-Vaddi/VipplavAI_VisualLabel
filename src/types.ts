export enum LabelClass {
  HELMET = "helmet",
  NO_HELMET = "no_helmet",
  BIKE_NUMBER_PLATE = "bike_number_plate",
  CAR_NUMBER_PLATE = "car_number_plate"
}

export const CLASS_MAPPING: Record<LabelClass, number> = {
  [LabelClass.HELMET]: 0,
  [LabelClass.NO_HELMET]: 1,
  [LabelClass.BIKE_NUMBER_PLATE]: 2,
  [LabelClass.CAR_NUMBER_PLATE]: 3
};

export const CLASS_COLORS: Record<LabelClass, string> = {
  [LabelClass.HELMET]: "#22c55e", // green-500
  [LabelClass.NO_HELMET]: "#ef4444", // red-500
  [LabelClass.BIKE_NUMBER_PLATE]: "#3b82f6", // blue-500
  [LabelClass.CAR_NUMBER_PLATE]: "#f97316" // orange-500
};

export interface User {
  _id: string;
  name: string;
  created_at: string;
  total_annotations: number;
}

export interface BoundingBox {
  id: string;
  class: LabelClass;
  x: number; // pixel x
  y: number; // pixel y
  width: number; // pixel width
  height: number; // pixel height
  // For YOLO format storage
  x_center?: number;
  y_center?: number;
  w_norm?: number;
  h_norm?: number;
}

export interface ImageDoc {
  _id: string;
  image_id: string;
  gridfs_id?: string;
  filename: string;
  dataset?: string;
  width: number;
  height: number;
  source: string;
  created_at: string;
  updated_at: string;
  dataUrl?: string; // For local files
  file?: File; // For local files, to preserve original binary data
  annotations?: BoundingBox[]; // Local persistence
  status: "unlabeled" | "in_progress" | "completed" | "skipped"; // For UI state
  workItem?: WorkItem; // Joined work item data for DB source
}

export interface WorkItem {
  _id?: string;
  image_id: string;
  dataset: string;
  user_id: string;
  session_id: string;
  assignment_status: "assigned" | "released" | "completed";
  annotation_status: "unlabeled" | "in_progress" | "labeled";
  save_status: "not_saved" | "db_saved";
  is_skipped: boolean;
  is_done_clicked: boolean;
  is_uploaded_to_db: boolean;
  assigned_at: string;
  last_activity_at: string;
  completed_at: string | null;
  released_at: string | null;
  lock_expires_at: string;
}

export interface AnnotationDoc {
  _id?: string;
  image_id: string;
  user_id: string;
  boxes: {
    class_id: number;
    class_name: string;
    x_center: number;
    y_center: number;
    width: number;
    height: number;
  }[];
  version: number;
  is_latest: boolean;
  created_at: string;
  updated_at: string;
}
