module.exports = {
  server: {
    baseDir: ".",
    serveStaticOptions: {
      etag: false,
      lastModified: false,
      cacheControl: false,
    },
    middleware: [
      (req, res, next) => {
        // Force no-cache behavior for all local dev responses.
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
        next();
      },
    ],
  },
  files: [
    "2026-08-SPORTS/**/*",
    "archive/**/*",
  ],
  startPath: "2026-08-SPORTS/",
  port: 3000,
  ui: {
    port: 3001,
  },
  notify: false,
  open: false,
};