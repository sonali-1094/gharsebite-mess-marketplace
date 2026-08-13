import express from "express";
import Food from "../models/Food.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireChefOrAdmin, requireShopkeeperOrAdmin } from "../middleware/roleAuth.js";

const router = express.Router();

router.post("/add", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags)
      ? req.body.tags
      : String(req.body.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

    const food = await Food.create({
      ...req.body,
      tags,
      chefId: req.body.chefId || req.auth.userId,
      chefName: req.body.chefName || req.body.shopName || req.staffEmail || "",
      shopkeeperId: req.body.shopkeeperId || req.auth.userId,
      shopName: req.body.shopName || req.body.chefName || req.staffEmail || ""
    });
    res.status(201).json(food);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const foods = await Food.find();
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/mine", requireClerkAuth, requireChefOrAdmin, async (req, res) => {
  try {
    const foods = await Food.find({
      $or: [
        { chefId: req.auth.userId },
        { shopkeeperId: req.auth.userId }
      ]
    }).sort({ createdAt: -1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);
    if (!food) {
      return res.status(404).json({ message: "Food not found" });
    }

    if (req.staffRole !== "admin" && food.shopkeeperId !== req.auth.userId && food.chefId !== req.auth.userId) {
      return res.status(403).json({ message: "You can delete only your own food items" });
    }

    await food.deleteOne();
    return res.json({ message: "Food deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);
    if (!food) {
      return res.status(404).json({ message: "Food not found" });
    }

    if (req.staffRole !== "admin" && food.shopkeeperId !== req.auth.userId && food.chefId !== req.auth.userId) {
      return res.status(403).json({ message: "You can update only your own food items" });
    }

    const updates = { ...req.body };
    if (updates.tags && !Array.isArray(updates.tags)) {
      updates.tags = String(updates.tags)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }

    Object.assign(food, updates);
    await food.save();
    return res.json(food);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
