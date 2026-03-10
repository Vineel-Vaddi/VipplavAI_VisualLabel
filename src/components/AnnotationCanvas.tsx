import React, { useState, useEffect, useRef, useMemo } from "react";
import { BoundingBox, LabelClass, CLASS_COLORS } from "../types";
import { clsx } from "clsx";

interface AnnotationCanvasProps {
  imageUrl: string;
  boxes: BoundingBox[];
  selectedBoxId: string | null;
  currentClass: LabelClass;
  onBoxChange: (boxes: BoundingBox[]) => void;
  onSelectBox: (id: string | null) => void;
  onImageLoad: (width: number, height: number) => void;
  showDebug?: boolean;
}

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  imageUrl,
  boxes,
  selectedBoxId,
  currentClass,
  onBoxChange,
  onSelectBox,
  onImageLoad,
  showDebug = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [imgError, setImgError] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, x: 0, y: 0, scale: 1 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, imgX: 0, imgY: 0 });
  const [drawingState, setDrawingState] = useState<"idle" | "drawing" | "finalized">("idle");
  const [startPos, setStartPos] = useState<{ x: number; y: number; imgX: number; imgY: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // Reset error when URL changes
  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  // Handle image loading
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgSize({ w: naturalWidth, h: naturalHeight });
    setImgError(false);
    onImageLoad(naturalWidth, naturalHeight);
    updateDisplaySize();
  };

  const handleImageError = () => {
    setImgError(true);
  };

  // Update display size and scale
  const updateDisplaySize = () => {
    if (!containerRef.current || !imageRef.current || imageRef.current.naturalWidth === 0) return;
    
    const container = containerRef.current;
    const img = imageRef.current;
    
    const containerRect = container.getBoundingClientRect();
    const containerW = containerRect.width;
    const containerH = containerRect.height;
    
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    
    const scaleX = containerW / imgW;
    const scaleY = containerH / imgH;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale beyond natural size if it fits
    
    const finalW = imgW * scale;
    const finalH = imgH * scale;
    
    const x = (containerW - finalW) / 2;
    const y = (containerH - finalH) / 2;
    
    setDisplaySize({ w: finalW, h: finalH, x, y, scale });
  };

  useEffect(() => {
    window.addEventListener("resize", updateDisplaySize);
    return () => window.removeEventListener("resize", updateDisplaySize);
  }, [imgSize]);

  // Coordinate mapping: Screen -> Image
  const screenToImage = (screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    
    // Relative to container
    const relX = screenX - rect.left - displaySize.x;
    const relY = screenY - rect.top - displaySize.y;
    
    // Relative to image pixels
    const imgX = relX / displaySize.scale;
    const imgY = relY / displaySize.scale;
    
    return { x: imgX, y: imgY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    const { x: imgX, y: imgY } = screenToImage(e.clientX, e.clientY);
    
    // Check if within image bounds
    if (imgX < 0 || imgX > imgSize.w || imgY < 0 || imgY > imgSize.h) {
      onSelectBox(null);
      return;
    }

    setDrawingState("drawing");
    setStartPos({ x: e.clientX, y: e.clientY, imgX, imgY });
    setCurrentRect({ x: imgX, y: imgY, w: 0, h: 0 });
    onSelectBox(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x: imgX, y: imgY } = screenToImage(e.clientX, e.clientY);
    setMousePos({ x: e.clientX, y: e.clientY, imgX, imgY });

    if (drawingState === "drawing" && startPos) {
      const w = imgX - startPos.imgX;
      const h = imgY - startPos.imgY;
      
      setCurrentRect({
        x: w < 0 ? imgX : startPos.imgX,
        y: h < 0 ? imgY : startPos.imgY,
        w: Math.abs(w),
        h: Math.abs(h)
      });
    }
  };

  const handleMouseUp = () => {
    if (drawingState === "drawing" && currentRect && startPos) {
      // Only add if it has some size
      if (currentRect.w > 5 && currentRect.h > 5) {
        const newBox: BoundingBox = {
          id: Math.random().toString(36).substr(2, 9),
          class: currentClass,
          x: currentRect.x,
          y: currentRect.y,
          width: currentRect.w,
          height: currentRect.h
        };
        onBoxChange([...boxes, newBox]);
        onSelectBox(newBox.id);
        setDrawingState("finalized");
      } else {
        setDrawingState("idle");
      }
    }
    setStartPos(null);
    setCurrentRect(null);
    if (drawingState !== "finalized") setDrawingState("idle");
  };

  // Reset finalized state after a short delay or on next move
  useEffect(() => {
    if (drawingState === "finalized") {
      const timer = setTimeout(() => setDrawingState("idle"), 500);
      return () => clearTimeout(timer);
    }
  }, [drawingState]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-neutral-900 overflow-hidden relative flex items-center justify-center select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: "crosshair" }}
    >
      {/* Image Layer */}
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Annotate"
        onLoad={handleImageLoad}
        onError={handleImageError}
        className={clsx("max-w-full max-h-full pointer-events-none", imgError && "hidden")}
        style={{ 
          width: displaySize.w > 0 ? `${displaySize.w}px` : 'auto',
          height: displaySize.h > 0 ? `${displaySize.h}px` : 'auto'
        }}
        referrerPolicy="no-referrer"
      />

      {imgError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 bg-neutral-900 gap-2 p-4 text-center">
          <div className="text-4xl">⚠️</div>
          <div className="font-bold">Failed to load image</div>
          <div className="text-xs text-neutral-500 break-all max-w-md">{imageUrl}</div>
          <div className="text-xs mt-2 text-neutral-400">
            {imageUrl.startsWith('/api') 
              ? "The server could not find the image in MongoDB. Check if the database is connected." 
              : "The local file reference might be invalid or blocked by the browser."}
          </div>
        </div>
      )}

      {/* SVG Annotation Layer */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        viewBox={`0 0 ${containerRef.current?.clientWidth || 0} ${containerRef.current?.clientHeight || 0}`}
      >
        <g transform={`translate(${displaySize.x}, ${displaySize.y}) scale(${displaySize.scale})`}>
          {/* Existing Boxes */}
          {boxes.map((box) => (
            <g key={box.id} className="pointer-events-auto cursor-pointer" onClick={(e) => {
              e.stopPropagation();
              onSelectBox(box.id);
            }}>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={CLASS_COLORS[box.class] + "33"}
                stroke={CLASS_COLORS[box.class]}
                strokeWidth={2 / displaySize.scale}
                className={clsx(
                  "transition-all",
                  selectedBoxId === box.id ? "stroke-[4px]" : "stroke-[2px]"
                )}
              />
              {selectedBoxId === box.id && (
                <text
                  x={box.x}
                  y={box.y - 5 / displaySize.scale}
                  fontSize={12 / displaySize.scale}
                  fill={CLASS_COLORS[box.class]}
                  fontWeight="bold"
                  className="uppercase"
                >
                  {box.class.replace(/_/g, ' ')}
                </text>
              )}
            </g>
          ))}

          {/* Current Drawing Rect */}
          {currentRect && (
            <rect
              x={currentRect.x}
              y={currentRect.y}
              width={currentRect.w}
              height={currentRect.h}
              fill="transparent"
              stroke={CLASS_COLORS[currentClass]}
              strokeWidth={2 / displaySize.scale}
              strokeDasharray={`${5 / displaySize.scale},${5 / displaySize.scale}`}
            />
          )}
        </g>
      </svg>

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md p-3 rounded-lg border border-white/10 text-[10px] font-mono text-neutral-400 pointer-events-none z-50 space-y-1">
          <div className="text-emerald-500 font-bold mb-1">DEBUG PANEL</div>
          <div>NATURAL SIZE: {imgSize.w} x {imgSize.h}</div>
          <div>DISPLAY SIZE: {Math.round(displaySize.w)} x {Math.round(displaySize.h)} (Scale: {displaySize.scale.toFixed(3)})</div>
          <div>MOUSE SCREEN: {Math.round(mousePos.x)}, {Math.round(mousePos.y)}</div>
          <div>MOUSE IMAGE: {Math.round(mousePos.imgX)}, {Math.round(mousePos.imgY)}</div>
          <div>STATE: <span className={clsx(
            drawingState === "drawing" ? "text-yellow-500" : 
            drawingState === "finalized" ? "text-emerald-500" : "text-neutral-500"
          )}>{drawingState.toUpperCase()}</span></div>
        </div>
      )}

      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500 bg-neutral-900">
          No image loaded
        </div>
      )}
    </div>
  );
};

export default AnnotationCanvas;
