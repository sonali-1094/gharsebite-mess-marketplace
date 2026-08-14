import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { clerkClient } from "@clerk/express";
import express from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    const messCount = await prisma.mess.count();

    res.json({
      success: true,
      message: "PostgreSQL connection is working!",
      database: "PostgreSQL",
      users: userCount,
      messes: messCount
    });
  } catch (error) {
    console.error("PostgreSQL test error:", error);

    res.status(500).json({
      success: false,
      message: "PostgreSQL connection failed",
      error: error.message
    });
  }
});

router.post("/user", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required"
      });
    }

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        email,
        role: "user",
        approvalStatus: "approved"
      }
    });

    res.status(201).json({
      success: true,
      message: "User created in PostgreSQL",
      user
    });
  } catch (error) {
    console.error("PostgreSQL user creation error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message
    });
  }
});

router.get("/clerk-user", requireClerkAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;

    const user = await clerkClient.users.getUser(userId);

    const email =
      user.emailAddresses?.find(
        (emailAddress) =>
          emailAddress.id === user.primaryEmailAddressId
      )?.emailAddress || "";

    res.json({
      success: true,
      clerkUser: {
        id: user.id,
        name: user.fullName || user.username || "",
        email
      }
    });
  } catch (error) {
    console.error("Clerk user test error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get Clerk user",
      error: error.message
    });
  }
});

export default router;