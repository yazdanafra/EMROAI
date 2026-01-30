# EMROAI/AI/fundus-lesions-toolkit/run_segment.py
"""
Robust segmentation runner for fundus-lesions-toolkit.
Writes:
 - label_mask.png    : single-channel integer labels (0..N-1) (argmax)
 - colored_mask.png  : colorized label mask (visual)
 - overlay.png       : original blended with colored mask
 - mask.npz          : raw HxWxC float mask (numpy compressed)
 - report.json       : per-label coverage, pixel counts, regions (bboxes)

This file tries to auto-add the local `src` folder to PYTHONPATH so you can run the script
from the project root, from EMROAI, or from inside the AI folder without installing the package.

Usage:
  python run_segment.py path/to/fundus.jpg [out_dir]
"""
from PIL import Image
import numpy as np
import os, sys, json, time, traceback
from pathlib import Path
from collections import deque
import random

# --- Auto-insert local src into sys.path to allow 'from fundus_lesions_toolkit import ...' ---
def _try_add_local_src_to_path():
    """
    Look for a 'src' dir that contains 'fundus_lesions_toolkit' in a few sensible places
    (script directory, parent, current working dir) and insert it into sys.path.
    """
    script_dir = Path(__file__).resolve().parent
    tried = []

    candidates = [
        script_dir / "src",
        script_dir.parent / "src",
        Path.cwd() / "AI" / "fundus-lesions-toolkit" / "src",
        Path.cwd() / "AI" / "fundus-lesions-toolkit" / "src",
        Path.cwd() / "src",
    ]

    # also look up the tree up to 3 levels for a src/fundus_lesions_toolkit
    p = script_dir
    for _ in range(4):
        candidates.append(p / "src")
        candidates.append(p)
        p = p.parent

    # normalize and dedupe
    seen = set()
    final = []
    for c in candidates:
        try:
            c = c.resolve()
        except Exception:
            c = c
        s = str(c)
        if s not in seen:
            seen.add(s)
            final.append(c)

    for c in final:
        tried.append(str(c))
        if (Path(c) / "fundus_lesions_toolkit").exists():
            # insert at front so it wins over installed packages
            if str(c) not in sys.path:
                sys.path.insert(0, str(c))
            return True, tried

    # last fallback: search under script_dir for the folder anywhere (limited depth)
    for candidate in script_dir.rglob("fundus_lesions_toolkit"):
        candidate_parent = candidate.parent
        if (candidate_parent / "fundus_lesions_toolkit").exists():
            if str(candidate_parent) not in sys.path:
                sys.path.insert(0, str(candidate_parent))
            tried.append(str(candidate_parent))
            return True, tried

    return False, tried

_ok, _tried_paths = _try_add_local_src_to_path()

# toolkit import (not failing hard so script can print helpful message)
try:
    from fundus_lesions_toolkit.models import segment, list_models
except Exception as e:
    # friendly message with hints
    print("Import warning (toolkit):", e)
    print()
    if not _ok:
        print("Tried to auto-add local 'src' to PYTHONPATH. Paths probed:")
        for p in _tried_paths[:15]:
            print(" -", p)
        print()
        print("Common fixes:")
        print("  * Confirm folder '.../fundus-lesions-toolkit/src/fundus_lesions_toolkit' exists.")
        print("  * If it exists, ensure it contains an '__init__.py' file (can be empty).")
        print("  * You can set PYTHONPATH before running, e.g. (Windows PowerShell):")
        print(r"      $env:PYTHONPATH = 'EMROAI\AI\fundus-lesions-toolkit\src'; python run_segment.py image.png")
        print("  * Or install editable: create a minimal pyproject.toml or setup.py and run:")
        print(r"      pip install -e .\EMROAI\AI\fundus-lesions-toolkit")
        print()
    else:
        print("Local 'src' was added to sys.path but import still failed. Maybe the package name changed or __init__.py is missing.")
        print("sys.path (first entries):")
        for p in sys.path[:8]:
            print(" -", p)
        print()
    segment = None
    list_models = None

# -------------------------------------------------------------------------
# (rest of your script unchanged, copy-pasted from your working version)
# -------------------------------------------------------------------------

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
    a = np.asarray(mask_arr)
    if a.ndim == 2:
        return np.expand_dims(a, axis=2).astype(float)
    if a.ndim == 3:
        d0,d1,d2 = a.shape
        if d0 <= 32 and d1 > d0 and d2 > d0:
            return np.transpose(a, (1,2,0)).astype(float)
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

    mask3 = fix_mask_axes(mask)
    Hm,Wm,Cm = mask3.shape
    print("Processed mask shape (H,W,C):", mask3.shape)

    np.savez_compressed(os.path.join(out_dir, "mask.npz"), mask=mask3)
    print("Saved mask.npz")

    label_mask = argmax_to_label_mask(mask3)
    save_image_uint8(label_mask, os.path.join(out_dir, "label_mask.png"))
    print("Saved label_mask.png")

    cmap = make_color_map(int(label_mask.max())+1 if label_mask.max()>=0 else 1)
    colored = colorize_label_mask(label_mask, cmap)
    save_image_uint8(colored, os.path.join(out_dir, "colored_mask.png"))
    print("Saved colored_mask.png")

    try:
        overlay = blend_overlay(img_np, colored, alpha=0.45)
        save_image_uint8(overlay, os.path.join(out_dir, "overlay.png"))
        print("Saved overlay.png")
    except Exception as e:
        print("Failed to build overlay:", e)

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
