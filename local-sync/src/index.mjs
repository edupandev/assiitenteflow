import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--once") {
      args.once = true;
    } else if (token.startsWith("--") && i + 1 < argv.length) {
      args[token.slice(2)] = argv[++i];
    }
  }
  return args;
}

function toSlug(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "projeto"
  );
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function runGit(cwd, gitArgs) {
  try {
    return execFileSync("git", gitArgs, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function findReadme(projectDir) {
  const candidates = ["README.md", "readme.md", "Readme.md"];
  for (const name of candidates) {
    const full = path.join(projectDir, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const raw = fs.readFileSync(full, "utf8");
      return {
        excerpt: raw.slice(0, 4000),
        hash: sha256(raw),
      };
    }
  }
  return { excerpt: null, hash: null };
}

function scanProject(projectDir) {
  const name = path.basename(projectDir);
  const slug = toSlug(name);
  const { excerpt, hash } = findReadme(projectDir);

  const isGit = runGit(projectDir, ["rev-parse", "--is-inside-work-tree"]) === "true";
  let branch = null;
  let canonicalOrigin = `local:${slug}`;
  let lastCommitSha = null;
  let recentCommits = [];
  let changedFiles = [];

  if (isGit) {
    branch = runGit(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]) || null;
    const remoteUrl = runGit(projectDir, ["remote", "get-url", "origin"]);
    if (remoteUrl) {
      canonicalOrigin = remoteUrl;
    }

    const logOutput = runGit(projectDir, [
      "log",
      "-n",
      "10",
      "--pretty=format:%H%x1f%s%x1f%an%x1f%aI",
    ]);

    if (logOutput) {
      recentCommits = logOutput
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [sha, message, author, date] = line.split("\x1f");
          return { sha, message, author, date };
        });
      lastCommitSha = recentCommits[0]?.sha ?? null;
    }

    const statusOutput = runGit(projectDir, ["status", "--porcelain"]);
    if (statusOutput) {
      changedFiles = statusOutput
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.slice(3).trim())
        .slice(0, 50);
    }
  }

  return {
    name,
    slug,
    localPath: projectDir,
    canonicalOrigin,
    branch,
    lastCommitSha,
    readmeExcerpt: excerpt,
    readmeHash: hash,
    recentCommits,
    changedFiles,
  };
}

function scanWorkspace(watchedPath) {
  if (!fs.existsSync(watchedPath)) {
    throw new Error(`Pasta monitorada não encontrada: ${watchedPath}`);
  }

  const entries = fs.readdirSync(watchedPath, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = path.join(watchedPath, entry.name);
    projects.push(scanProject(fullPath));
  }

  return projects;
}

async function syncOnce({ apiUrl, token, watchedPath, previousHashes }) {
  const projects = scanWorkspace(watchedPath);
  const changedProjects = [];

  for (const proj of projects) {
    const sig = sha256(
      JSON.stringify({
        readmeHash: proj.readmeHash,
        lastCommitSha: proj.lastCommitSha,
        branch: proj.branch,
        changedFiles: proj.changedFiles,
      })
    );
    if (previousHashes.get(proj.localPath) !== sig) {
      changedProjects.push({ proj, sig });
    }
  }

  if (changedProjects.length === 0) {
    console.log(`[${new Date().toLocaleTimeString()}] Nenhuma alteração detectada.`);
    return;
  }

  const endpoint = `${apiUrl.replace(/\/+$/, "")}/api/sync/local`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      watchedPath,
      projects: changedProjects.map((c) => c.proj),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Erro HTTP ${res.status}: ${data.error ?? "Falha no sync"}`);
  }

  for (const item of changedProjects) {
    previousHashes.set(item.proj.localPath, item.sig);
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] Sincronizado: ${data.projectsSynced} projeto(s), ${data.eventsCreated} evento(s).`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiUrl = args.url || process.env.PULSEWORK_API_URL || "http://localhost:3000";
  const token = args.token || process.env.PULSEWORK_SYNC_TOKEN;
  const watchedPath = args.path || process.env.PULSEWORK_SYNC_PATH;
  const intervalSec = Number.parseInt(
    args.interval || process.env.PULSEWORK_SYNC_INTERVAL || "60",
    10
  );

  if (!token || !watchedPath) {
    console.error(
      "Uso: node src/index.mjs --url <URL> --token <TOKEN> --path <PASTA> [--once] [--interval 60]"
    );
    process.exit(1);
  }

  const previousHashes = new Map();
  console.log(`Monitorando projetos em: ${watchedPath}`);
  console.log(`Destino: ${apiUrl}`);

  await syncOnce({ apiUrl, token, watchedPath, previousHashes });

  if (args.once) return;

  setInterval(() => {
    syncOnce({ apiUrl, token, watchedPath, previousHashes }).catch((err) => {
      console.error(`[erro] ${err.message}`);
    });
  }, Math.max(10, intervalSec) * 1000);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
