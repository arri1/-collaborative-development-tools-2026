import { build } from "esbuild";
import { promises as fs } from "fs";
import path from "path";

const root = process.cwd();
const entry = path.join(root, "client", "app.js");
const outfile = path.join(root, "public", "app.bundle.js");

await build({
  entryPoints: [entry],
  bundle: true,
  minify: false,
  sourcemap: true,
  format: "esm",
  target: ["es2020"],
  outfile
});

// Copy static assets
await fs.copyFile(path.join(root, "client", "index.html"), path.join(root, "public", "index.html"));
await fs.copyFile(path.join(root, "client", "style.css"), path.join(root, "public", "style.css"));

console.log("Client built to public/");