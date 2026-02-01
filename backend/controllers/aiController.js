// backend/controllers/aiController.js
// Improved AI runner: returns both stable URLs and immediate base64 images to frontend,
// uses PROJECT_ROOT to build paths, and includes detailed debug on failure.

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import http from "http";
import https from "https";
import { pipeline } from "stream/promises";
import urlModule from "url";

function debugLog(...args) {
  console.log("[AI_CONTROLLER]", ...args);
}

async function downloadHttpToFile(url, outPath) {
  const proto = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const req = proto.get(url, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        return resolve(downloadHttpToFile(res.headers.location, outPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(outPath);
      pipeline(res, ws).then(resolve).catch(reject);
    });
    req.on("error", (err) => reject(err));
  });
}

async function writeBase64ToFile(dataUri, outPath) {
  const m = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("Invalid base64 data URI");
  const b = Buffer.from(m[2], "base64");
  await fsp.writeFile(outPath, b);
}

async function copyLocalFile(src, dst) {
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  await pipeline(fs.createReadStream(src), fs.createWriteStream(dst));
}

async function runPythonScript(pythonBin, scriptPath, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function resolveProjectRoot() {
  if (
    process.env.NODE_PROJECT_ROOT &&
    fs.existsSync(process.env.NODE_PROJECT_ROOT)
  ) {
    return path.resolve(process.env.NODE_PROJECT_ROOT);
  }
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "backend")
    return path.resolve(cwd, "..");
  let p = cwd;
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(p, "package.json")) ||
      fs.existsSync(path.join(p, ".git"))
    ) {
      return p;
    }
    p = path.resolve(p, "..");
  }
  return cwd;
}

function findPythonBinary(projectRoot) {
  if (process.env.PYTHON_BIN && fs.existsSync(process.env.PYTHON_BIN))
    return process.env.PYTHON_BIN;
  const winVenv = path.join(projectRoot, ".venv", "Scripts", "python.exe");
  const nixVenv = path.join(projectRoot, ".venv", "bin", "python");
  if (fs.existsSync(winVenv)) return winVenv;
  if (fs.existsSync(nixVenv)) return nixVenv;
  return "python";
}

function makePublicResultPaths(projectRoot, runId) {
  // write to backend/public/ai_results/<runId>
  const publicDir = path.join(projectRoot, "backend", "public", "ai_results");
  const destDir = path.join(publicDir, runId);
  const urlBase = `/ai_results/${runId}`; // relative to same-origin server
  return { publicDir, destDir, urlBase };
}

async function fileToDataUri(p) {
  if (!fs.existsSync(p)) return null;
  const b = await fsp.readFile(p);
  const ext = path.extname(p).toLowerCase().replace(".", "") || "png";
  return `data:image/${ext};base64,${b.toString("base64")}`;
}

export async function analyzeImage(req, res) {
  let runTmpDir = null;
  try {
    const { fileUrl } = req.body || {};
    if (!fileUrl)
      return res
        .status(400)
        .json({ success: false, message: "fileUrl required" });

    const PROJECT_ROOT = resolveProjectRoot();
    debugLog("PROJECT_ROOT:", PROJECT_ROOT);

    const backendDir = process.cwd();
    const tmpBase = path.join(backendDir, "tmp", "ai_runs");
    await fsp.mkdir(tmpBase, { recursive: true });

    const runId = crypto.randomBytes(6).toString("hex");
    runTmpDir = path.join(tmpBase, runId);
    await fsp.mkdir(runTmpDir, { recursive: true });

    // prepare input file
    let inFile = path.join(runTmpDir, "input.png");
    try {
      if (typeof fileUrl !== "string")
        throw new Error("fileUrl must be string");
      const trimmed = fileUrl.trim();

      if (trimmed.startsWith("data:")) {
        await writeBase64ToFile(trimmed, inFile);
      } else if (/^https?:\/\//i.test(trimmed)) {
        await downloadHttpToFile(trimmed, inFile);
      } else if (trimmed.startsWith("file://")) {
        const local = urlModule.fileURLToPath(trimmed);
        if (!fs.existsSync(local))
          throw new Error("Local file not found: " + local);
        await copyLocalFile(local, inFile);
      } else {
        let candidate = trimmed;
        if (!path.isAbsolute(candidate))
          candidate = path.resolve(PROJECT_ROOT, candidate);
        if (!fs.existsSync(candidate))
          throw new Error("File not found: " + candidate);
        await copyLocalFile(candidate, inFile);
      }
    } catch (err) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Failed to obtain input file",
          detail: String(err),
        });
    }

    const outDir = path.join(runTmpDir, "out");
    await fsp.mkdir(outDir, { recursive: true });

    // find script
    const envScript = process.env.PYTHON_SCRIPT;
    let scriptPath = null;
    if (envScript && fs.existsSync(envScript)) scriptPath = envScript;
    else {
      const candidates = [
        path.join(
          PROJECT_ROOT,
          "AI",
          "fundus-lesions-toolkit",
          "run_segment.py",
        ),
        path.join(PROJECT_ROOT, "AI", "run_segment.py"),
        path.join(
          PROJECT_ROOT,
          "AI",
          "fundus-lesions-toolkit",
          "src",
          "run_segment.py",
        ),
        path.join(backendDir, "run_segment.py"),
      ];
      for (const c of candidates)
        if (fs.existsSync(c)) {
          scriptPath = c;
          break;
        }
    }
    if (!scriptPath) {
      return res
        .status(500)
        .json({
          success: false,
          message: "run_segment.py not found",
          probed: { env: process.env.PYTHON_SCRIPT },
        });
    }

    const pythonBin = findPythonBinary(PROJECT_ROOT);
    debugLog("Running python", pythonBin, "script:", scriptPath);

    // venv env if exists
    const env = { ...process.env };
    const venvPath = path.join(PROJECT_ROOT, ".venv");
    if (fs.existsSync(venvPath)) {
      const vScripts =
        process.platform === "win32"
          ? path.join(venvPath, "Scripts")
          : path.join(venvPath, "bin");
      env.PATH = `${vScripts}${path.delimiter}${env.PATH || ""}`;
      env.VIRTUAL_ENV = venvPath;
    }

    const spawnCwd = PROJECT_ROOT;
    const { code, stdout, stderr } = await runPythonScript(
      pythonBin,
      scriptPath,
      [inFile, outDir],
      { cwd: spawnCwd, env },
    );

    const debug = { pythonBin, scriptPath, code, stdout, stderr };

    if (code !== 0) {
      debugLog("Python returned code", code);
      return res
        .status(500)
        .json({ success: false, message: "AI script error", debug });
    }

    const reportPath = path.join(outDir, "report.json");
    const overlayPath = path.join(outDir, "overlay.png");
    const labelPath = path.join(outDir, "label_mask.png");
    const coloredPath = path.join(outDir, "colored_mask.png");
    const maskNpz = path.join(outDir, "mask.npz");

    // public dest dir
    const { destDir, urlBase } = makePublicResultPaths(PROJECT_ROOT, runId);
    await fsp.mkdir(destDir, { recursive: true });

    const result = {};

    // copy & parse report
    if (fs.existsSync(reportPath)) {
      await copyLocalFile(reportPath, path.join(destDir, "report.json"));
      const raw = await fsp.readFile(path.join(destDir, "report.json"), "utf8");
      try {
        result.report = JSON.parse(raw);
      } catch (e) {
        result.report = { error: "invalid JSON", raw: raw.slice(0, 200) };
      }
    } else {
      result.report = { error: "report.json not produced" };
    }

    // copy files to destDir and prepare immediate base64 images
    async function copyAndReturnUrlAndBase64(srcPath, destName) {
      const dest = path.join(destDir, destName);
      if (!fs.existsSync(srcPath)) return { url: null, base64: null };
      await copyLocalFile(srcPath, dest);
      const url = `${urlBase}/${destName}`; // relative URL path
      const base64 = await fileToDataUri(dest);
      return { url, base64 };
    }

    const overlayResult = await copyAndReturnUrlAndBase64(
      overlayPath,
      "overlay.png",
    );
    const coloredResult = await copyAndReturnUrlAndBase64(
      coloredPath,
      "colored_mask.png",
    );
    const labelResult = await copyAndReturnUrlAndBase64(
      labelPath,
      "label_mask.png",
    );
    const maskResult = fs.existsSync(maskNpz) ? `${urlBase}/mask.npz` : null;

    result.urls = {
      overlay: overlayResult.url,
      colored_mask: coloredResult.url,
      label_mask: labelResult.url,
      raw_mask: maskResult,
      report:
        result.report && result.report.output_dir
          ? `${urlBase}/report.json`
          : `${urlBase}/report.json`,
    };

    result.images = {
      overlay: overlayResult.base64,
      colored_mask: coloredResult.base64,
      label_mask: labelResult.base64,
    };

    // Return debug info always for visibility (so frontend can show logs if needed)
    const response = { success: true, analysis: result, debug };
    return res.json(response);
  } catch (err) {
    console.error("[AI_CONTROLLER] Fatal error:", err);
    return res
      .status(500)
      .json({ success: false, message: String(err), stack: err.stack });
  } finally {
    // keep runTmpDir for inspection during development
  }
}
