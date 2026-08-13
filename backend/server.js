import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { connectDB } from "./config/db.js";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import chefRoutes from "./routes/chef.js";
import foodRoutes from "./routes/Food.js";
import orderRoutes from "./routes/order.js";
import paymentRoutes from "./routes/payment.js";
import messRoutes from "./routes/mess.js";
import { isDbConnected } from "./middleware/requireDbConnection.js";

const app = express();
app.use(cors());
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(clerkMiddleware());

app.use("/api/auth", authRoutes);
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

app.get("/api/health", (req, res) => {
  res.json({
    app: "GharSeBite API",
    dbConnected: isDbConnected(),
  });
});

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(error.message);
    console.warn(
      "Server will keep running, but database-backed APIs will fail until MongoDB connects."
    );
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();
