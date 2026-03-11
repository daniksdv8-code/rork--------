import { createTRPCRouter } from "./create-context";
import { parkingRouter } from "./routes/parking";

export const appRouter = createTRPCRouter({
  parking: parkingRouter,
});

export type AppRouter = typeof appRouter;
