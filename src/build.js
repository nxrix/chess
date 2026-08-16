import { minify } from "terser";
import { readFile, writeFile } from "node:fs/promises";
const input = await readFile("./src/chess.js", "utf8");
const result = await minify(input, {
  compress: {
    passes: 3
  },
  mangle: true,
  module: true,
  format: {
    comments: false
  }
});
await writeFile("./dist/chess.min.js", result.code);
console.log(`Built ${result.code.length} bytes`);
