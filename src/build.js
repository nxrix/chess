import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

await mkdir("./dist", { recursive: true });
const input = "./src/chess.js";

await build({
  entryPoints: [input],
  outfile: "./dist/chess.min.js",
  bundle: true,
  format: "esm",
  minify: true,
  treeShaking: true,
  legalComments: "none",
  drop: ["console", "debugger"],
  target: "es2018"
});

/*import { minify } from "terser";
const source = await readFile(input, "utf8");
const terser = await minify(source, {
  module: true,
  compress: {
    passes: 5,
    toplevel: true,
    unsafe: true,
    unsafe_arrows: true,
    unsafe_methods: true,
    drop_console: true,
    dead_code: true
  },
  mangle: {
    toplevel: true
  },
  format: {
    comments: false
  }
});
await writeFile(
  "./dist/chess.terser.min.js",
  terser.code
);*/
