const path = process.argv[2];
const body = await Bun.file(path).text();
const started = performance.now();
const response = await fetch("http://127.0.0.1:2000/trigger", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});
const elapsed = performance.now() - started;
const text = await response.text();
console.log("STATUS=" + response.status);
console.log("LISTEN_ELAPSED_MS=" + elapsed.toFixed(1));
console.log("BODY_CHARS=" + body.length);
console.log("RESPONSE=" + text);
