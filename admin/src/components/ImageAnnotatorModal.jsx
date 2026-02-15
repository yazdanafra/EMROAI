// admin/src/components/ImageAnnotatorModal.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * ImageAnnotatorModal
 * - src: image URL or data URI
 * - filename: optional used for download
 * - onClose: () => void
 *
 * Notes:
 * - header layout changed: filename moved to its own row above controls
 * - long filename handling: truncation with ellipsis + full name on hover (title)
 * - other functionality unchanged
 */
export default function ImageAnnotatorModal({
  src,
  filename = "image",
  onClose,
}) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // view transforms (these are for UI pan/zoom)
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panRef = useRef({ dragging: false, start: null, startOffset: null });

  const [tool, setTool] = useState("pan"); // pan | measure | label
  const [mmPerPx, setMmPerPx] = useState(0.264);

  // larger default font sizes (no UI control)
  const labelFontSize = 25; // bigger label text now
  const measureFontSize = 25; // bigger measure text

  // tiny state to force re-renders when needed
  const [alignTick, setAlignTick] = useState(0);

  // temporary measurement point in image natural pixels
  const [tempPoint, setTempPoint] = useState(null);

  // annotations in image natural pixels:
  // label: { id, type:'label', x, y, text, color }
  // measure: { id, type:'measure', x, y, x2, y2 }
  const [annotations, setAnnotations] = useState([]);
  const idCounterRef = useRef(1);

  // undo/redo stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // context menu
  const [contextMenu, setContextMenu] = useState(null);

  // dragging annotations
  const dragRef = useRef(null); // { id, part: 'label'|'p1'|'p2', pointerId, before }

  // scroll lock
  const scrollLockRef = useRef({
    locked: false,
    scrollY: 0,
    windowWheelHandler: null,
  });

  // palette (8 colors)
  const palette = [
    "#ff3b30", // red
    "#ff9500", // orange
    "#ffcc00", // yellow
    "#34c759", // green
    "#007aff", // blue
    "#5856d6", // purple
    "#ff2d55", // pink
    "#8e8e93", // gray
  ];

  // label modal (in-app)
  const [labelModal, setLabelModal] = useState({
    open: false,
    text: "",
    x: 0,
    y: 0,
    editingId: null,
    color: palette[0],
  });

  /* --------------------------
     Persist / Restore to localStorage
     -------------------------- */
  const storageKey = src ? `image-annotator:${encodeURIComponent(src)}` : null;

  // flag that we restored a saved view; used to skip fitToWindow on img onLoad
  const skipFitOnLoadRef = useRef(false);

  // load saved state when src changes / component mounts
  useEffect(() => {
    if (!storageKey) {
      skipFitOnLoadRef.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.annotations && Array.isArray(parsed.annotations)) {
          setAnnotations(parsed.annotations);
          // bump id counter to avoid collisions
          let maxIdNum = 0;
          parsed.annotations.forEach((a) => {
            const m = String(a.id || "").match(/^a(\d+)$/);
            if (m) maxIdNum = Math.max(maxIdNum, Number(m[1]));
          });
          idCounterRef.current = Math.max(idCounterRef.current, maxIdNum + 1);
        }
        if (typeof parsed.mmPerPx === "number") setMmPerPx(parsed.mmPerPx);
        if (parsed.zoom && typeof parsed.zoom === "number") {
          setZoom(parsed.zoom);
          skipFitOnLoadRef.current = true;
        } else {
          skipFitOnLoadRef.current = false;
        }
        if (parsed.offset && typeof parsed.offset.x === "number") {
          setOffset(parsed.offset);
        }
      } else {
        skipFitOnLoadRef.current = false;
      }
    } catch (err) {
      console.warn("Failed to restore annotator state:", err);
      skipFitOnLoadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // auto-save when annotations / mmPerPx / zoom / offset change
  useEffect(() => {
    if (!storageKey) return;
    try {
      const payload = {
        annotations,
        mmPerPx,
        zoom,
        offset,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to save annotator state:", err);
    }
  }, [annotations, mmPerPx, zoom, offset, storageKey]);

  const clearSavedState = () => {
    if (!storageKey) return;
    localStorage.removeItem(storageKey);
    skipFitOnLoadRef.current = false;
  };

  /* --------------------------
     Scroll lock + capture wheel
     -------------------------- */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    scrollLockRef.current.scrollY = scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    scrollLockRef.current.locked = true;

    const preventTouch = (e) => e.preventDefault();
    document.addEventListener("touchmove", preventTouch, { passive: false });

    const windowWheelHandler = (ev) => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(ev.target)) ev.preventDefault();
    };
    window.addEventListener("wheel", windowWheelHandler, {
      passive: false,
      capture: true,
    });
    scrollLockRef.current.windowWheelHandler = windowWheelHandler;

    if (containerRef.current) {
      containerRef.current.style.overscrollBehavior = "none";
      containerRef.current.style.touchAction = "none";
    }

    return () => {
      document.removeEventListener("touchmove", preventTouch);
      document.body.style.overflow = prevOverflow || "";
      document.body.style.position = prevPosition || "";
      document.body.style.top = prevTop || "";
      if (scrollLockRef.current.locked)
        window.scrollTo(0, scrollLockRef.current.scrollY || 0);
      scrollLockRef.current.locked = false;

      if (scrollLockRef.current.windowWheelHandler) {
        window.removeEventListener(
          "wheel",
          scrollLockRef.current.windowWheelHandler,
          { capture: true },
        );
        scrollLockRef.current.windowWheelHandler = null;
      }
      if (containerRef.current) {
        containerRef.current.style.overscrollBehavior = "";
        containerRef.current.style.touchAction = "";
      }
    };
  }, []);

  /* --------------------------
     Coordinate helpers
     -------------------------- */
  const getImageNaturalSize = () => {
    const img = imgRef.current;
    if (!img) return { iw: 1, ih: 1 };
    return {
      iw: img.naturalWidth || img.width || 1,
      ih: img.naturalHeight || img.height || 1,
    };
  };

  const clientToImagePixel = (clientX, clientY) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;

    const imgRect = img.getBoundingClientRect();
    const { iw, ih } = getImageNaturalSize();

    const relX = clientX - imgRect.left;
    const relY = clientY - imgRect.top;

    const scaleX = imgRect.width / iw || 1;
    const scaleY = imgRect.height / ih || 1;

    const ix = relX / scaleX;
    const iy = relY / scaleY;

    return {
      x: Math.max(0, Math.min(iw, ix)),
      y: Math.max(0, Math.min(ih, iy)),
      iw,
      ih,
    };
  };

  const imagePixelToScreen = (ix, iy) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container)
      return { x: ix * zoom + offset.x, y: iy * zoom + offset.y };

    const imgRect = img.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect?.() || {
      left: 0,
      top: 0,
    };
    const { iw } = getImageNaturalSize();
    const scaleX = imgRect.width / iw || 1;
    const x = imgRect.left - containerRect.left + ix * scaleX;
    const y = imgRect.top - containerRect.top + iy * scaleX;
    return { x, y };
  };

  /* --------------------------
   CLAMP HELPERS: keep image inside viewer bounds
   -------------------------- */
  const clampAndSet = (proposedZoom, proposedOffset) => {
    const img = imgRef.current;
    const container = containerRef.current;

    if (!img || !container) {
      setZoom(proposedZoom);
      setOffset(proposedOffset || { x: 0, y: 0 });
      return;
    }

    const { iw, ih } = getImageNaturalSize();
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const dispW = Math.max(1, iw * proposedZoom);
    const dispH = Math.max(1, ih * proposedZoom);

    let minLeft, maxLeft;
    if (dispW <= cw) {
      minLeft = 0;
      maxLeft = cw - dispW;
    } else {
      minLeft = cw - dispW;
      maxLeft = 0;
    }

    let minTop, maxTop;
    if (dispH <= ch) {
      minTop = 0;
      maxTop = ch - dispH;
    } else {
      minTop = ch - dispH;
      maxTop = 0;
    }

    const defaultX = (cw - dispW) / 2;
    const defaultY = (ch - dispH) / 2;

    let px =
      typeof proposedOffset?.x === "number" ? proposedOffset.x : defaultX;
    let py =
      typeof proposedOffset?.y === "number" ? proposedOffset.y : defaultY;

    px = Math.min(maxLeft, Math.max(minLeft, px));
    py = Math.min(maxTop, Math.max(minTop, py));

    setZoom(proposedZoom);
    setOffset({ x: px, y: py });
  };

  /* --------------------------
     Undo / Redo
     -------------------------- */
  const pushAction = (action) => {
    setUndoStack((u) => [...u, action]);
    setRedoStack([]);
  };

  const undo = () => {
    setUndoStack((u) => {
      if (!u || u.length === 0) return u;
      const last = u[u.length - 1];
      setAnnotations((anns) => {
        if (last.op === "add") return anns.filter((a) => a.id !== last.item.id);
        if (last.op === "remove") return [...anns, last.item];
        if (last.op === "move")
          return anns.map((a) =>
            a.id === last.item.id ? { ...a, ...last.item.before } : a,
          );
        if (last.op === "edit")
          return anns.map((a) =>
            a.id === last.item.id ? { ...a, ...last.item.before } : a,
          );
        return anns;
      });
      setRedoStack((r) => [...r, last]);
      return u.slice(0, -1);
    });
    setContextMenu(null);
  };

  const redo = () => {
    setRedoStack((r) => {
      if (!r || r.length === 0) return r;
      const last = r[r.length - 1];
      setAnnotations((anns) => {
        if (last.op === "add") return [...anns, last.item];
        if (last.op === "remove")
          return anns.filter((a) => a.id !== last.item.id);
        if (last.op === "move")
          return anns.map((a) =>
            a.id === last.item.id ? { ...a, ...last.item.after } : a,
          );
        if (last.op === "edit")
          return anns.map((a) =>
            a.id === last.item.id ? { ...a, ...last.item.after } : a,
          );
        return anns;
      });
      setUndoStack((u) => [...u, last]);
      return r.slice(0, -1);
    });
    setContextMenu(null);
  };

  /* --------------------------
     Add / Remove / Compute
     -------------------------- */
  const addLabelAt = (ix, iy, initialText = "") => {
    setLabelModal({
      open: true,
      text: initialText,
      x: ix,
      y: iy,
      editingId: null,
      color: palette[0],
    });
  };

  const confirmAddLabel = (text) => {
    const { x, y, color } = labelModal;
    if (!text) {
      setLabelModal({
        open: false,
        text: "",
        x: 0,
        y: 0,
        editingId: null,
        color: palette[0],
      });
      return;
    }
    const id = `a${idCounterRef.current++}`;
    const ann = { id, type: "label", x, y, text, color };
    setAnnotations((s) => [...s, ann]);
    pushAction({ op: "add", item: ann });
    setLabelModal({
      open: false,
      text: "",
      x: 0,
      y: 0,
      editingId: null,
      color: palette[0],
    });
  };

  const addMeasureFinal = (ix1, iy1, ix2, iy2) => {
    const id = `a${idCounterRef.current++}`;
    const ann = { id, type: "measure", x: ix1, y: iy1, x2: ix2, y2: iy2 };
    setAnnotations((s) => [...s, ann]);
    pushAction({ op: "add", item: ann });
  };

  const computeDistanceMm = (ann) => {
    if (!ann || ann.type !== "measure") return 0;
    const dx = ann.x2 - ann.x;
    const dy = ann.y2 - ann.y;
    const px = Math.hypot(dx, dy);
    return px * mmPerPx;
  };

  const removeAnnotation = (id) => {
    setAnnotations((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (!removed) return prev;
      pushAction({ op: "remove", item: removed });
      return prev.filter((a) => a.id !== id);
    });
    setContextMenu(null);
  };

  /* --------------------------
     Drag-to-move annotation handlers
     -------------------------- */
  const handleAnnotationPointerDown = (e, ann, part) => {
    e.stopPropagation();
    const pointerId = e.pointerId;
    dragRef.current = { id: ann.id, part, pointerId, before: { ...ann } };
    e.currentTarget.setPointerCapture?.(pointerId);
  };

  const handleDocumentPointerMove = (e) => {
    if (!dragRef.current) return;
    const { id, part } = dragRef.current;
    const imgPt = clientToImagePixel(e.clientX, e.clientY);
    if (!imgPt) return;
    setAnnotations((anns) =>
      anns.map((a) => {
        if (a.id !== id) return a;
        if (a.type === "label" && part === "label")
          return { ...a, x: imgPt.x, y: imgPt.y };
        if (a.type === "measure") {
          if (part === "p1") return { ...a, x: imgPt.x, y: imgPt.y };
          if (part === "p2") return { ...a, x2: imgPt.x, y2: imgPt.y };
        }
        return a;
      }),
    );
  };

  const handleDocumentPointerUp = (e) => {
    if (!dragRef.current) return;
    const { id, before } = dragRef.current;
    const after = annotations.find((a) => a.id === id);
    if (before && after)
      pushAction({ op: "move", item: { id, before, after: { ...after } } });
    try {
      e.target?.releasePointerCapture?.(e.pointerId);
    } catch (err) {}
    dragRef.current = null;
  };

  useEffect(() => {
    window.addEventListener("pointermove", handleDocumentPointerMove);
    window.addEventListener("pointerup", handleDocumentPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleDocumentPointerMove);
      window.removeEventListener("pointerup", handleDocumentPointerUp);
    };
    // eslint-disable-next-line
  }, [annotations]);

  /* --------------------------
     Container pointer handlers (add, pan, measure flow)
     -------------------------- */
  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (dragRef.current) return;

    if (tool === "pan") {
      panRef.current.dragging = true;
      panRef.current.start = { x: e.clientX, y: e.clientY };
      panRef.current.startOffset = { ...offset };
      e.preventDefault();
      return;
    }

    const imgPt = clientToImagePixel(e.clientX, e.clientY);
    if (!imgPt) return;

    if (tool === "label") {
      setLabelModal({
        open: true,
        text: "",
        x: imgPt.x,
        y: imgPt.y,
        editingId: null,
        color: palette[0],
      });
      return;
    }

    if (tool === "measure") {
      if (!tempPoint) {
        setTempPoint({ x: imgPt.x, y: imgPt.y });
      } else {
        addMeasureFinal(tempPoint.x, tempPoint.y, imgPt.x, imgPt.y);
        setTempPoint(null);
      }
      return;
    }
  };

  const handlePointerMove = (e) => {
    if (panRef.current.dragging && tool === "pan") {
      const dx = e.clientX - panRef.current.start.x;
      const dy = e.clientY - panRef.current.start.y;
      const newOffset = {
        x: panRef.current.startOffset.x + dx,
        y: panRef.current.startOffset.y + dy,
      };
      clampAndSet(zoom, newOffset);
    }
  };

  const handlePointerUp = () => (panRef.current.dragging = false);

  useEffect(() => {
    const onUp = () => (panRef.current.dragging = false);
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  /* --------------------------
     Wheel zoom for UI
     -------------------------- */
  const handleWheel = (e) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.08 : 1 / 1.08;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const newZoom = Math.max(0.05, Math.min(20, zoom * factor));
    const imageX = (cx - offset.x) / zoom;
    const imageY = (cy - offset.y) / zoom;

    const newOffsetX = cx - imageX * newZoom;
    const newOffsetY = cy - imageY * newZoom;

    clampAndSet(newZoom, { x: newOffsetX, y: newOffsetY });
  };

  /* --------------------------
     Fit/reset image view
     -------------------------- */
  const resetView = () => {
    clampAndSet(1, { x: 0, y: 0 });
    skipFitOnLoadRef.current = false;
  };

  const fitToWindow = () => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih);
    const newZoom = scale;
    const newOffsetX = (cw - iw * newZoom) / 2;
    const newOffsetY = (ch - ih * newZoom) / 2;
    clampAndSet(newZoom, { x: newOffsetX, y: newOffsetY });
    skipFitOnLoadRef.current = false;
  };

  /* --------------------------
     Annotation context & edit
     -------------------------- */
  const handleAnnotationContext = (e, ann) => {
    e.preventDefault();
    const containerRect = containerRef.current.getBoundingClientRect();
    setContextMenu({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
      targetId: ann.id,
    });
  };

  const openEditLabelModal = (ann) => {
    setLabelModal({
      open: true,
      text: ann.text,
      x: ann.x,
      y: ann.y,
      editingId: ann.id,
      color: ann.color || palette[0],
    });
  };

  const confirmEditLabel = (text) => {
    const { editingId, color } = labelModal;
    if (editingId === null) {
      confirmAddLabel(text);
      return;
    }
    const before = annotations.find((a) => a.id === editingId);
    if (!before) {
      setLabelModal({
        open: false,
        text: "",
        x: 0,
        y: 0,
        editingId: null,
        color: palette[0],
      });
      return;
    }
    const after = { ...before, text, color };
    setAnnotations((anns) => anns.map((a) => (a.id === editingId ? after : a)));
    pushAction({
      op: "edit",
      item: { id: editingId, before: { ...before }, after },
    });
    setLabelModal({
      open: false,
      text: "",
      x: 0,
      y: 0,
      editingId: null,
      color: palette[0],
    });
  };

  /* --------------------------
     Export (draw on natural-size canvas)
     -------------------------- */
  const exportMergedPNG = async () => {
    const img = imgRef.current;
    if (!img) return;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = iw;
    canvas.height = ih;
    const ctx = canvas.getContext("2d");

    try {
      ctx.drawImage(img, 0, 0, iw, ih);
    } catch (err) {
      try {
        const resp = await fetch(src, { mode: "cors" });
        if (!resp.ok) throw new Error("fetch failed");
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, 0, 0, iw, ih);
      } catch (err2) {
        console.error("Export failed (CORS/fetch)", err, err2);
        alert(
          "Unable to export image (CORS). Serve images with Access-Control-Allow-Origin or host same-origin.",
        );
        return;
      }
    }

    ctx.lineWidth = Math.max(1, 2);
    ctx.font = `${labelFontSize}px Arial`;
    ctx.textBaseline = "alphabetic";

    for (const a of annotations) {
      if (a.type === "label") {
        ctx.fillStyle = a.color || "rgba(255,0,0,0.95)";
        ctx.fillText(a.text || "label", a.x + 4, a.y - 4);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      } else if (a.type === "measure") {
        ctx.strokeStyle = "rgba(0,120,255,0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x2, a.y2);
        ctx.stroke();
        const mm = computeDistanceMm(a).toFixed(2);
        const mx = (a.x + a.x2) / 2;
        const my = (a.y + a.y2) / 2;
        ctx.fillStyle = "rgba(0,120,255,0.95)";
        ctx.font = `${measureFontSize}px Arial`;
        ctx.fillText(`${mm} mm`, mx + 6, my - 6);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        alert("Failed to create image");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}-annotated.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, "image/png");
  };

  /* --------------------------
     Keyboard shortcuts
     -------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === "y" || (e.key === "Z" && e.ctrlKey && e.shiftKey)) &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        if (labelModal.open) {
          setLabelModal({
            open: false,
            text: "",
            x: 0,
            y: 0,
            editingId: null,
            color: palette[0],
          });
        } else {
          onClose?.();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [undoStack, redoStack, annotations, labelModal]);

  // try crossOrigin for image to increase export chance
  useEffect(() => {
    if (imgRef.current) {
      try {
        imgRef.current.crossOrigin = "anonymous";
      } catch (e) {}
    }
  }, [src]);

  // close context menu clicking outside container
  useEffect(() => {
    const onClick = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setContextMenu(null);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  /* --------------------------
     Adjust overlay (fixes tiny misalignments after zoom)
     -------------------------- */
  const adjustOverlay = () => {
    if (!imgRef.current || !containerRef.current) {
      setAlignTick((t) => t + 1);
      return;
    }

    imgRef.current.getBoundingClientRect();
    containerRef.current.getBoundingClientRect();

    setOffset((o) => ({ ...o }));
    setAlignTick((t) => t + 1);

    requestAnimationFrame(() => {
      setZoom((z) => z);
      setOffset((o) => ({ ...o }));
      setAlignTick((t) => t + 1);
    });
  };

  /* --------------------------
     Render helpers
     -------------------------- */
  const renderAnnotationSVG = (a) => {
    if (!imgRef.current) return null;
    if (a.type === "label") {
      return (
        <g
          key={a.id}
          onContextMenu={(e) => {
            e.preventDefault();
            const containerRect = containerRef.current.getBoundingClientRect();
            setContextMenu({
              x: e.clientX - containerRect.left,
              y: e.clientY - containerRect.top,
              targetId: a.id,
            });
          }}
          style={{ cursor: "grab", pointerEvents: "auto" }}
        >
          <circle
            cx={a.x}
            cy={a.y}
            r={8}
            fill={a.color || "rgba(255,0,0,0.95)"}
            stroke="#fff"
            strokeWidth={1}
            onPointerDown={(e) => handleAnnotationPointerDown(e, a, "label")}
          />
          <text
            x={a.x + 12}
            y={a.y - 10}
            fontSize={labelFontSize}
            fill={a.color || "rgba(255,0,0,0.95)"}
            style={{ userSelect: "none", pointerEvents: "auto" }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openEditLabelModal(a);
            }}
          >
            {a.text}
          </text>
        </g>
      );
    } else if (a.type === "measure") {
      const mmVal = computeDistanceMm(a).toFixed(2);
      return (
        <g key={a.id} style={{ pointerEvents: "auto" }}>
          <line
            x1={a.x}
            y1={a.y}
            x2={a.x2}
            y2={a.y2}
            stroke="rgba(0,120,255,0.95)"
            strokeWidth={4}
            strokeLinecap="round"
            onContextMenu={(e) => handleAnnotationContext(e, a)}
          />
          <circle
            cx={a.x}
            cy={a.y}
            r={8}
            fill="rgba(0,120,255,0.95)"
            onPointerDown={(e) => handleAnnotationPointerDown(e, a, "p1")}
          />
          <circle
            cx={a.x2}
            cy={a.y2}
            r={8}
            fill="rgba(0,120,255,0.95)"
            onPointerDown={(e) => handleAnnotationPointerDown(e, a, "p2")}
          />
          <rect
            x={(a.x + a.x2) / 2 - 40}
            y={(a.y + a.y2) / 2 - 14}
            width={80}
            height={28}
            rx={6}
            fill="rgba(0,120,255,0.9)"
            pointerEvents="none"
          />
          <text
            x={(a.x + a.x2) / 2}
            y={(a.y + a.y2) / 2 + 6}
            fontSize={measureFontSize}
            fill="#fff"
            textAnchor="middle"
            alignmentBaseline="middle"
            pointerEvents="none"
          >
            {mmVal} mm
          </text>
        </g>
      );
    }
    return null;
  };

  const computeSvgOverlay = () => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return null;
    const imgRect = img.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const left = imgRect.left - containerRect.left;
    const top = imgRect.top - containerRect.top;
    const width = imgRect.width;
    const height = imgRect.height;
    const { iw, ih } = getImageNaturalSize();
    return { left, top, width, height, iw, ih };
  };

  const svgOverlay = computeSvgOverlay();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onClose?.()}
        aria-hidden
      />

      {/* modal panel */}
      <div className="relative z-10 w-full max-w-[96vw] max-h-[94vh] bg-white rounded shadow-lg overflow-hidden pr-16">
        {/* close top-right */}
        <button
          onClick={() => onClose?.()}
          className="absolute top-3 right-4 z-50 rounded px-2 py-1 bg-gray-100 border"
          title="Close"
          aria-label="Close annotator"
        >
          ✕
        </button>

        {/* HEADER: filename in its own row (prevents long names from pushing controls) */}
        <div className="px-4 py-3 border-b">
          {/* filename row: full width, truncates if too long, shows full name on hover via title */}
          <div className="w-full min-w-0 mb-2">
            <div
              className="font-semibold text-sm truncate"
              title={filename}
              style={{ maxWidth: "100%" }}
            >
              {filename}
            </div>
          </div>

          {/* control row: left small label/scale, right toolbar */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500 flex items-center gap-3">
              <div className="hidden sm:block">Annotator</div>

              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>Scale (mm / px):</span>
                <input
                  type="number"
                  step="0.001"
                  value={mmPerPx}
                  onChange={(e) => setMmPerPx(Number(e.target.value))}
                  className="w-28 border rounded px-2 py-0.5 text-sm"
                  title="Millimetres per pixel. Calibrate for accuracy."
                />
                <button
                  onClick={adjustOverlay}
                  className="ml-2 px-2 py-1 border rounded text-sm bg-white"
                  title="Adjust overlay to correct any small misalignments"
                >
                  Adjust
                </button>
              </div>
            </div>

            {/* right toolbar — fixed to right and won't be pushed by filename */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setTool("pan")}
                  className={`px-3 py-1 rounded ${tool === "pan" ? "bg-primary text-white" : "bg-white border"}`}
                >
                  Pan
                </button>
                <button
                  onClick={() => setTool("measure")}
                  className={`px-3 py-1 rounded ${tool === "measure" ? "bg-primary text-white" : "bg-white border"}`}
                >
                  Measure
                </button>
                <button
                  onClick={() => setTool("label")}
                  className={`px-3 py-1 rounded ${tool === "label" ? "bg-primary text-white" : "bg-white border"}`}
                >
                  Label
                </button>
                <button
                  onClick={() => fitToWindow()}
                  className="px-3 py-1 rounded bg-white border"
                  title="Fit image"
                >
                  Fit
                </button>
              </div>

              <div className="flex items-center gap-2 px-2 py-1 border rounded bg-white">
                <button
                  onClick={() =>
                    clampAndSet(
                      Math.max(0.05, Math.min(20, zoom / 1.2)),
                      offset,
                    )
                  }
                  className="px-2 py-1"
                >
                  −
                </button>
                <input
                  type="range"
                  min={0.05}
                  max={20}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => clampAndSet(Number(e.target.value), offset)}
                  style={{ width: 120 }}
                />
                <button
                  onClick={() =>
                    clampAndSet(
                      Math.max(0.05, Math.min(20, zoom * 1.2)),
                      offset,
                    )
                  }
                  className="px-2 py-1"
                >
                  +
                </button>
              </div>

              <button
                onClick={undo}
                className="px-3 py-1 rounded bg-white border"
                title="Undo (Ctrl/Cmd+Z)"
              >
                Undo
              </button>
              <button
                onClick={redo}
                className="px-3 py-1 rounded bg-white border"
                title="Redo (Ctrl/Cmd+Y)"
              >
                Redo
              </button>

              <button
                onClick={exportMergedPNG}
                className="px-3 py-1 rounded bg-primary text-white whitespace-nowrap"
              >
                Download PNG
              </button>

              <button
                onClick={() => clearSavedState()}
                className="px-3 py-1 rounded bg-white border text-sm mr-2"
                title="Clear saved annotations for this image"
              >
                Clear saved
              </button>
            </div>
          </div>
        </div>

        {/* main viewer: overflow hidden so image can't visually escape the black frame */}
        <div
          ref={containerRef}
          className="relative w-full h-[72vh] sm:h-[60vh] bg-[#111111] cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={resetView}
          style={{
            overscrollBehavior: "none",
            touchAction: "none",
            overflow: "hidden",
          }}
        >
          <img
            ref={imgRef}
            src={src}
            crossOrigin="anonymous"
            alt="annotate"
            draggable={false}
            onLoad={() => {
              if (!skipFitOnLoadRef.current) {
                fitToWindow();
              } else {
                const safeOffset = {
                  x: typeof offset.x === "number" ? offset.x : 0,
                  y: typeof offset.y === "number" ? offset.y : 0,
                };
                clampAndSet(zoom, safeOffset);

                setTimeout(() => {
                  setZoom((z) => z);
                  setOffset((o) => ({ ...o }));
                  setAlignTick((t) => t + 1);
                }, 0);
              }
            }}
            style={{
              position: "absolute",
              left: offset.x,
              top: offset.y,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              userSelect: "none",
              pointerEvents: "none",
              willChange: "transform",
            }}
          />

          {/* SVG overlay */}
          {svgOverlay && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgOverlay.iw} ${svgOverlay.ih}`}
              preserveAspectRatio="xMinYMin meet"
              style={{
                position: "absolute",
                left: svgOverlay.left + "px",
                top: svgOverlay.top + "px",
                width: svgOverlay.width + "px",
                height: svgOverlay.height + "px",
                pointerEvents: "auto",
                overflow: "visible",
              }}
            >
              <rect
                x={0}
                y={0}
                width={svgOverlay.iw}
                height={svgOverlay.ih}
                fill="transparent"
              />
              {tempPoint && (
                <circle
                  cx={tempPoint.x}
                  cy={tempPoint.y}
                  r={8}
                  fill="rgba(255,255,255,0.12)"
                  stroke="rgba(255,255,255,0.2)"
                  pointerEvents="none"
                />
              )}
              {annotations.map((a) => renderAnnotationSVG(a))}
            </svg>
          )}

          {/* context menu */}
          {contextMenu && (
            <div
              style={{
                position: "absolute",
                left: contextMenu.x,
                top: contextMenu.y,
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                padding: 8,
                borderRadius: 6,
                boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                zIndex: 60,
              }}
            >
              <button
                onClick={() => removeAnnotation(contextMenu.targetId)}
                className="text-sm px-2 py-1"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t text-sm text-gray-600">
          <div className="flex items-center justify-between">
            <div>
              Tool: <strong>{tool}</strong> • Zoom: {zoom.toFixed(2)} •
              Annotations: {annotations.length}
            </div>
            <div className="text-xs text-gray-500">
              Tip: Drag points to move. Right-click on an element to delete.
              Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Y.
            </div>
          </div>
        </div>
      </div>

      {/* In-app Label Modal */}
      {labelModal.open && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() =>
              setLabelModal({
                open: false,
                text: "",
                x: 0,
                y: 0,
                editingId: null,
                color: palette[0],
              })
            }
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded shadow-lg p-4">
            <div className="font-semibold mb-2">
              {labelModal.editingId ? "Edit label" : "Add label"}
            </div>
            <input
              autoFocus
              value={labelModal.text}
              onChange={(e) =>
                setLabelModal((s) => ({ ...s, text: e.target.value }))
              }
              className="w-full border rounded p-2 mb-3"
              placeholder="Label text"
            />

            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-1">Color</div>
              <div className="flex gap-2">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLabelModal((s) => ({ ...s, color: c }))}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: c,
                      border:
                        labelModal.color === c
                          ? "3px solid rgba(0,0,0,0.12)"
                          : "1px solid rgba(0,0,0,0.06)",
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-100"
                onClick={() =>
                  setLabelModal({
                    open: false,
                    text: "",
                    x: 0,
                    y: 0,
                    editingId: null,
                    color: palette[0],
                  })
                }
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-primary text-white"
                onClick={() =>
                  labelModal.editingId
                    ? confirmEditLabel(labelModal.text)
                    : confirmAddLabel(labelModal.text)
                }
              >
                {labelModal.editingId ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
