import express from "express";
import Mess from "../models/Mess.js";
import Menu from "../models/Menu.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireShopkeeperOrAdmin } from "../middleware/roleAuth.js";

const router = express.Router();
const todayRange = () => { const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; };
const ownerFilter = (req, id) => req.staffRole === "admin" ? { _id: id } : { _id: id, ownerId: req.auth.userId };

router.get("/", async (req, res) => {
  try {
    const query = { approvalStatus: "approved" };
    if (req.query.area) query.area = new RegExp(`^${req.query.area}$`, "i");
    const messes = await Mess.find(query).sort({ rating: -1, name: 1 });
    res.json(messes);
  } catch (error) { res.status(500).json({ message: "Unable to load messes." }); }
});

router.get("/today", async (req, res) => {
  try {
    const { start, end } = todayRange();
    const menuQuery = { date: { $gte: start, $lt: end }, isAvailable: true, availableQuantity: { $gt: 0 } };
    if (req.query.mealType) menuQuery.mealType = String(req.query.mealType).toUpperCase();
    if (req.query.dietaryType) menuQuery.dietaryType = String(req.query.dietaryType).toUpperCase();
    const menus = await Menu.find(menuQuery).populate({ path: "messId", match: { approvalStatus: "approved", ...(req.query.area ? { area: new RegExp(`^${req.query.area}$`, "i") } : {}) } }).sort({ price: 1 });
    res.json(menus.filter((menu) => menu.messId));
  } catch (error) { res.status(500).json({ message: "Unable to load today's menus." }); }
});

router.get("/:id", async (req, res) => {
  try {
    const mess = await Mess.findOne({ _id: req.params.id, approvalStatus: "approved" });
    if (!mess) return res.status(404).json({ message: "Mess not found." });
    const { start, end } = todayRange();
    const menus = await Menu.find({ messId: mess._id, date: { $gte: start, $lt: end } }).sort({ mealType: 1 });
    res.json({ mess, menus });
  } catch (error) { res.status(500).json({ message: "Unable to load mess details." }); }
});

router.post("/", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try { res.status(201).json(await Mess.create({ ...req.body, ownerId: req.auth.userId })); }
  catch (error) { res.status(400).json({ message: "Please provide complete mess details." }); }
});

router.post("/:id/menus", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const mess = await Mess.findOne(ownerFilter(req, req.params.id));
    if (!mess) return res.status(403).json({ message: "You can manage only your own mess." });
    const menu = await Menu.findOneAndUpdate({ messId: mess._id, date: new Date(req.body.date), mealType: String(req.body.mealType).toUpperCase() }, { ...req.body, messId: mess._id }, { new: true, upsert: true, runValidators: true });
    res.status(201).json(menu);
  } catch (error) { res.status(400).json({ message: "Please provide a valid dated meal menu." }); }
});

router.patch("/:id/menus/:menuId", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const mess = await Mess.findOne(ownerFilter(req, req.params.id));
    if (!mess) return res.status(403).json({ message: "You can manage only your own mess." });
    const menu = await Menu.findOneAndUpdate({ _id: req.params.menuId, messId: mess._id }, req.body, { new: true, runValidators: true });
    if (!menu) return res.status(404).json({ message: "Menu not found." });
    res.json(menu);
  } catch (error) { res.status(400).json({ message: "Unable to update menu." }); }
});

export default router;
