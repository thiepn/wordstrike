import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const testsDirectory = new URL("../tests/", import.meta.url);
const files = (await readdir(testsDirectory))
  .filter((name) => name.endsWith(".test.js"))
  .sort();

if (!files.length) {
  console.error("No test files found.");
  process.exitCode = 1;
} else {
  console.log(`Running ${files.length} WORDSTRIKE test files...`);
}

for (const file of files) {
  const testPath = fileURLToPath(new URL(file, testsDirectory));
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [testPath], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`${file} terminated by ${signal}.`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    console.error(`Test failed: ${file}`);
    process.exitCode = exitCode;
    break;
  }
}

if (!process.exitCode) {
  console.log(`All ${files.length} test files passed.`);
}
