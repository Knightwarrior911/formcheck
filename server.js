import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // CSP: allow self, MediaPipe CDN, and inline styles (needed for dynamic UI)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' blob: data: https://storage.googleapis.com; " +
    "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com; " +
    "font-src 'self';"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Fallback to index.html for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  FormCheck running →  http://localhost:${PORT}`);
  console.log(`  PWA: installable on mobile home screen`);
  console.log(`  All processing is local — no cloud needed\n`);
});
