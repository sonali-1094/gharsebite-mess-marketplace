import dbTestRoutes from "./routes/dbTest.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import prisma from "./lib/prisma.js";

import adminRoutes from "./routes/admin.js";
import chefRoutes from "./routes/chef.js";
import foodRoutes from "./routes/Food.js";
import orderRoutes from "./routes/order.js";
import paymentRoutes from "./routes/payment.js";
import messRoutes from "./routes/mess.js";

const app = express();
app.use(express.json());
app.use(cors());
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(clerkMiddleware());
app.use("/api/db-test", dbTestRoutes);

app.use("/api/admin", adminRoutes);
app.use("/api/chef", chefRoutes);
app.use("/api/food", foodRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/messes", messRoutes);

app.get("/", (req, res) => {
  res.send("GharSeBite healthy Indian tiffin backend running");
});

const PORT = process.env.PORT || 5000;

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ app: "GharSeBite API", dbConnected: true, database: "PostgreSQL" });
  } catch (error) {
    res.status(503).json({ app: "GharSeBite API", dbConnected: false, database: "PostgreSQL" });
  }
});

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();
