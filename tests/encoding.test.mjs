import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkedFiles = [
  "index.html",
  "refresh.html",
  "manifest.webmanifest",
  "src/app.js",
  "src/core.js",
  "sw-v9.js",
  "sw-weekly-v1.js",
  "sw-my-v1.js",
  "sw-home-my-v1.js",
  "sw-home-my-v2.js",
  "sw-home-my-v3.js",
  "sw-image-quota-v1.js",
  "sw-cloud-images-v1.js",
  "sw-dish-video-v1.js",
  "sw-ui-polish-v1.js",
  "sw-cloud-merge-v1.js",
  "sw-cloud-error-v1.js",
];

const mojibakePattern = /浠|鑿|浜戠|绠€|銆|锛|�|閲嶆柊|闅忔満|杩斿洖|鍒楄〃|鍒犻櫎|鏍囩|缂栬緫|鍋氭硶|鍥剧墖/;

test("user-facing source files do not contain mojibake or UTF-8 BOM", () => {
  const failures = [];

  for (const file of checkedFiles) {
    const content = readFileSync(file, "utf8");
    if (content.charCodeAt(0) === 0xfeff) {
      failures.push(`${file}:1: unexpected UTF-8 BOM`);
    }

    content.split(/\r?\n/).forEach((line, index) => {
      if (mojibakePattern.test(line)) {
        failures.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(failures, []);
});
