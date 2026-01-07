# run_segment.py
"""
Robust segmentation runner for fundus-lesions-toolkit.
Writes:
 - label_mask.png    : single-channel integer labels (0..N-1) (argmax)
 - colored_mask.png  : colorized label mask (visual)
 - overlay.png       : original blended with colored mask
 - mask.npz          : raw HxWxC float mask (numpy compressed)
 - report.json       : per-label coverage, pixel counts, regions (bboxes)
Usage:
  python run_segment.py path/to/fundus.jpg [out_dir]
"""
from PIL import Image
import numpy as np
import os, sys, json, time, traceback
from pathlib import Path
from collections import deque
import random

# toolkit import (not failing hard so script can print helpful message)
try:
    from fundus_lesions_toolkit.models import segment, list_models
except Exception as e:
    print("Import warning (toolkit):", e)
    segment = None
    list_models = None

def make_color_map(n):
    random.seed(0)
    cmap = []
    for i in range(n):
        h = (i * 0.618033988749895) % 1.0
        s = 0.65
        v = 0.95
        cmap.append(hsv_to_rgb(h, s, v))
    return cmap

def hsv_to_rgb(h, s, v):
    i = int(h * 6.0)
    f = (h * 6.0) - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    i = i % 6
    if i == 0: r,g,b = v,t,p
    elif i == 1: r,g,b = q,v,p
    elif i == 2: r,g,b = p,v,t
    elif i == 3: r,g,b = p,q,v
    elif i == 4: r,g,b = t,p,v
    else: r,g,b = v,p,q
    return (r,g,b)

def argmax_to_label_mask(mask3):
    # mask3: HxWxC float scores/probabilities -> return HxW int labels (0..C-1)
    # if C==1 treat binary threshold 0.5
    if mask3.ndim != 3:
        raise ValueError("mask3 must be HxWxC")
    H,W,C = mask3.shape
    if C == 1:
        lbl = (mask3[...,0] > 0.5).astype(np.uint8)
    else:
        lbl = np.argmax(mask3, axis=2).astype(np.uint8)
    return lbl

def colorize_label_mask(lbl_mask, cmap):
    H,W = lbl_mask.shape
    out = np.zeros((H,W,3), dtype=np.uint8)
    for i, col in enumerate(cmap):
        mask = (lbl_mask == i)
        rgb = (np.array(col) * 255).astype(np.uint8)
        out[mask] = rgb
    return out

def blend_overlay(orig_rgb, colored_rgb, alpha=0.45):
    orig = orig_rgb.astype(float)/255.0
    col = colored_rgb.astype(float)/255.0
    blended = np.clip((1-alpha)*orig + alpha*col, 0.0, 1.0)
    return (blended*255).astype(np.uint8)

# small connected component finder (4-neigh) returning bboxes for binary mask
def connected_components_bboxes(bin_mask, max_regions=200):
    H,W = bin_mask.shape
    visited = np.zeros_like(bin_mask, dtype=bool)
    regions = []
    dq = deque()
    for y in range(H):
        for x in range(W):
            if bin_mask[y,x] and not visited[y,x]:
                dq.append((y,x))
                visited[y,x] = True
                coords = []
                while dq:
                    cy,cx = dq.popleft()
                    coords.append((cy,cx))
                    for ny,nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                        if 0 <= ny < H and 0 <= nx < W and not visited[ny,nx] and bin_mask[ny,nx]:
                            visited[ny,nx] = True
                            dq.append((ny,nx))
                ys = [p[0] for p in coords]; xs = [p[1] for p in coords]
                ymin,ymax = min(ys), max(ys); xmin,xmax = min(xs), max(xs)
                regions.append({"pixel_count": len(coords), "bbox": [int(xmin), int(ymin), int(xmax-xmin+1), int(ymax-ymin+1)]})
                if len(regions) >= max_regions:
                    return regions
    return regions

def analyze_labels(lbl_mask, max_regions=20):
    H,W = lbl_mask.shape
    labels = np.unique(lbl_mask)
    out = {}
    for lbl in labels:
        mask = (lbl_mask == lbl)
        pixel_count = int(mask.sum())
        coverage = float(100.0 * pixel_count / (H*W))
        regions = []
        if pixel_count > 0:
            regions = connected_components_bboxes(mask, max_regions)
        out[int(lbl)] = {"pixel_count": pixel_count, "coverage_percent": coverage, "num_regions": len(regions), "regions": regions[:max_regions]}
    return out

def fix_mask_axes(mask_arr):
    """
    Ensure mask is H x W x C.
    Handles common returned shapes:
     - (H, W) -> expand to (H, W, 1)
     - (H, W, C) -> ok
     - (C, H, W) -> transpose to (H, W, C) (heuristic: if first dim is small <=32)
    """
    a = np.asarray(mask_arr)
    if a.ndim == 2:
        return np.expand_dims(a, axis=2).astype(float)
    if a.ndim == 3:
        d0,d1,d2 = a.shape
        # Heuristic: if d0 is small relative to others and <=32, treat as (C,H,W)
        if d0 <= 32 and d1 > d0 and d2 > d0:
            # transpose C,H,W -> H,W,C
            return np.transpose(a, (1,2,0)).astype(float)
        # else if d2 <=32 and d0 > d2 and d1 > d2 maybe (H,W,C) already or (W,H,C) unlikely
        return a.astype(float)
    raise ValueError("Unsupported mask ndim: " + str(a.ndim))

def save_image_uint8(arr, path):
    from imageio import imwrite
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        if a.max() <= 1.0:
            a = (a*255).astype(np.uint8)
        else:
            a = a.astype(np.uint8)
    imwrite(path, a)

def main(image_path, out_dir="out", threshold=0.5):
    start = time.time()
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    if not os.path.exists(image_path):
        print("Input not found:", image_path); return
    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)
    H,W,_ = img_np.shape
    print("Input image:", image_path, "size:", W, "x", H)
    if list_models is not None:
        try:
            print("Available models:", list_models())
        except Exception:
            pass

    if segment is None:
        print("segment() not available. Aborting.")
        return

    try:
        pred = segment(img_np, device="cpu", compile=False)
    except Exception as e:
        print("Error running segment():", e)
        traceback.print_exc()
        return

    mask = None
    meta = {}
    if isinstance(pred, dict):
        mask = pred.get("masks") or pred.get("mask") or pred.get("pred") or pred.get("m")
        meta = {k:v for k,v in pred.items() if k not in ("masks","mask","pred","m")}
    elif isinstance(pred, (list,tuple)):
        mask = pred[0] if len(pred)>0 else None
    else:
        mask = pred

    if mask is None:
        print("No mask found in model output.")
        return

    # Fix axes to H x W x C
    mask3 = fix_mask_axes(mask)
    Hm,Wm,Cm = mask3.shape
    print("Processed mask shape (H,W,C):", mask3.shape)

    # Save raw mask compressed
    np.savez_compressed(os.path.join(out_dir, "mask.npz"), mask=mask3)
    print("Saved mask.npz")

    # get single label mask (argmax) — final single output
    label_mask = argmax_to_label_mask(mask3)  # HxW uint8
    save_image_uint8(label_mask, os.path.join(out_dir, "label_mask.png"))
    print("Saved label_mask.png")

    # colorize
    cmap = make_color_map(int(label_mask.max())+1 if label_mask.max()>=0 else 1)
    colored = colorize_label_mask(label_mask, cmap)
    save_image_uint8(colored, os.path.join(out_dir, "colored_mask.png"))
    print("Saved colored_mask.png")

    # overlay
    try:
        overlay = blend_overlay(img_np, colored, alpha=0.45)
        save_image_uint8(overlay, os.path.join(out_dir, "overlay.png"))
        print("Saved overlay.png")
    except Exception as e:
        print("Failed to build overlay:", e)

    # analyze per-label
    analysis = analyze_labels(label_mask, max_regions=50)

    report = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "input_image": os.path.abspath(image_path),
        "output_dir": os.path.abspath(out_dir),
        "mask_shape": [int(Hm), int(Wm), int(Cm)],
        "num_labels": int(label_mask.max())+1,
        "analysis": analysis,
        "notes": {"threshold": float(threshold), "meta": meta}
    }

    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("Saved report.json")

    print("Done. elapsed %.2fs" % (time.time()-start))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_segment.py path/to/fundus.jpg [out_dir]")
        sys.exit(1)
    inp = sys.argv[1]
    outd = sys.argv[2] if len(sys.argv) > 2 else "out"
    main(inp, outd)
