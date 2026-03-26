import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getBackupJson } from "./trpc/routes/parking";

const app = new Hono();

app.use("*", cors());

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Parking API is running" });
});

function handleBackup(c: any) {
  try {
    const json = getBackupJson();
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `parking_backup_${dateStr}.json`;
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${fileName}"`);
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    c.header('Access-Control-Allow-Origin', '*');
    console.log(`[Backup] Server backup endpoint called, json length=${json.length}`);
    return c.body(json);
  } catch (e) {
    console.error('[Backup] Server backup endpoint error:', e);
    c.header('Access-Control-Allow-Origin', '*');
    return c.json({ error: 'Failed to create backup', details: String(e) }, 500);
  }
}

app.get("/backup", handleBackup);
app.get("/api/backup", handleBackup);

export default app;
