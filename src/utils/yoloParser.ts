import { BoundingBox, LabelClass } from "../types";

export interface YoloLine {
  classId: number;
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
  isValid: boolean;
  raw: string;
}

export function parseYoloLine(line: string): YoloLine {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { classId: -1, xCenter: 0, yCenter: 0, width: 0, height: 0, isValid: false, raw: line };
  }

  const classId = parseInt(parts[0]);
  const xCenter = parseFloat(parts[1]);
  const yCenter = parseFloat(parts[2]);
  const width = parseFloat(parts[3]);
  const height = parseFloat(parts[4]);

  const isValid = 
    !isNaN(classId) && 
    !isNaN(xCenter) && !isNaN(yCenter) && 
    !isNaN(width) && !isNaN(height) &&
    xCenter >= 0 && xCenter <= 1 &&
    yCenter >= 0 && yCenter <= 1 &&
    width >= 0 && width <= 1 &&
    height >= 0 && height <= 1;

  return { classId, xCenter, yCenter, width, height, isValid, raw: line };
}

export function yoloToPixel(
  yolo: YoloLine, 
  imgWidth: number, 
  imgHeight: number,
  classMap: Record<number, LabelClass>
): BoundingBox | null {
  if (!yolo.isValid) return null;

  const width = yolo.width * imgWidth;
  const height = yolo.height * imgHeight;
  const x = (yolo.xCenter * imgWidth) - (width / 2);
  const y = (yolo.yCenter * imgHeight) - (height / 2);

  return {
    id: Math.random().toString(36).substr(2, 9),
    class: classMap[yolo.classId] || LabelClass.HELMET, // Default or handle unknown
    x,
    y,
    width,
    height
  };
}

export const REVERSE_CLASS_MAPPING: Record<number, LabelClass> = {
  0: LabelClass.HELMET,
  1: LabelClass.NO_HELMET,
  2: LabelClass.BIKE_NUMBER_PLATE,
  3: LabelClass.CAR_NUMBER_PLATE
};

export const CLASS_MAPPING: Record<LabelClass, number> = {
  [LabelClass.HELMET]: 0,
  [LabelClass.NO_HELMET]: 1,
  [LabelClass.BIKE_NUMBER_PLATE]: 2,
  [LabelClass.CAR_NUMBER_PLATE]: 3
};

export function pixelToNormalized(
  box: BoundingBox,
  imgWidth: number,
  imgHeight: number
) {
  const x_center = (box.x + box.width / 2) / imgWidth;
  const y_center = (box.y + box.height / 2) / imgHeight;
  const width = box.width / imgWidth;
  const height = box.height / imgHeight;

  return {
    class_id: CLASS_MAPPING[box.class],
    class_name: box.class,
    x_center,
    y_center,
    width,
    height
  };
}

export function normalizedToPixel(
  norm: { class_id: number; x_center: number; y_center: number; width: number; height: number },
  imgWidth: number,
  imgHeight: number
): BoundingBox {
  const width = norm.width * imgWidth;
  const height = norm.height * imgHeight;
  const x = (norm.x_center * imgWidth) - (width / 2);
  const y = (norm.y_center * imgHeight) - (height / 2);

  return {
    id: Math.random().toString(36).substr(2, 9),
    class: REVERSE_CLASS_MAPPING[norm.class_id] || LabelClass.HELMET,
    x,
    y,
    width,
    height
  };
}
