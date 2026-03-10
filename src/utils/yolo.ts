import JSZip from "jszip";
import { BoundingBox, CLASS_MAPPING, LabelClass } from "../types";

export function convertToYOLO(
  boxes: BoundingBox[],
  imageWidth: number,
  imageHeight: number
): string {
  return boxes
    .map((box) => {
      const classId = CLASS_MAPPING[box.class];
      const xCenter = (box.x + box.width / 2) / imageWidth;
      const yCenter = (box.y + box.height / 2) / imageHeight;
      const width = box.width / imageWidth;
      const height = box.height / imageHeight;

      return `${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`;
    })
    .join("\n");
}

export interface ExportImage {
  filename: string;
  boxes: BoundingBox[];
  width: number;
  height: number;
  data: Blob | string; // Binary data or base64 data URL
}

export async function generateYOLOZip(
  images: ExportImage[]
): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder("yolo_dataset");
  if (!root) throw new Error("Could not create root folder");

  const imagesFolder = root.folder("images");
  const labelsFolder = root.folder("labels");
  
  if (!imagesFolder || !labelsFolder) throw new Error("Could not create dataset folders");

  console.log(`Starting YOLO export for ${images.length} images...`);

  for (const img of images) {
    // 1. Create label file
    const yoloContent = convertToYOLO(img.boxes, img.width, img.height);
    const stem = img.filename.replace(/\.[^/.]+$/, "");
    const labelFilename = stem + ".txt";
    labelsFolder.file(labelFilename, yoloContent);

    // 2. Add image file
    if (img.data instanceof Blob) {
      console.log(`Adding image: ${img.filename} (Size: ${img.data.size} bytes)`);
      imagesFolder.file(img.filename, img.data);
    } else if (typeof img.data === "string") {
      if (img.data.startsWith("data:")) {
        const base64Data = img.data.split(",")[1];
        console.log(`Adding image: ${img.filename} (Base64 data URL)`);
        imagesFolder.file(img.filename, base64Data, { base64: true });
      } else if (img.data.startsWith("blob:")) {
        // This shouldn't happen if we use the File object, but just in case
        console.log(`Fetching blob data for: ${img.filename}`);
        const res = await fetch(img.data);
        const blob = await res.blob();
        console.log(`Adding image: ${img.filename} (Fetched Blob Size: ${blob.size} bytes)`);
        imagesFolder.file(img.filename, blob);
      } else {
        console.warn(`Unknown data format for ${img.filename}, skipping image file.`);
      }
    }
  }

  // 3. Add data.yaml
  const dataYaml = `
path: .
train: images
val: images
nc: 4
names:
  - helmet
  - no_helmet
  - bike_number_plate
  - car_number_plate
  `.trim();
  
  root.file("data.yaml", dataYaml);

  return await zip.generateAsync({ type: "blob" });
}
