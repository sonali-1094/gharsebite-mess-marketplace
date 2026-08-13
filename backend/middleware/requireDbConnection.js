import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

export const isDbConnected = () => mongoose.connection.readyState === 1;

let pendingConnection = null;

export const requireDbConnection = async (req, res, next) => {
  if (isDbConnected()) {
    return next();
  }

  try {
    pendingConnection ??= connectDB().finally(() => {
      pendingConnection = null;
    });

    await pendingConnection;
    return next();
  } catch (error) {
    return res.status(503).json({
      message: "Database is not connected. Please check MongoDB connection and restart the backend server.",
      error: error.message
    });
  }
};
