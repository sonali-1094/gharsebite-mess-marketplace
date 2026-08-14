import express from "express";
import prisma from "../lib/prisma.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { requireShopkeeperOrAdmin } from "../middleware/roleAuth.js";
import { syncClerkUser } from "../utils/syncClerkUser.js";

const router = express.Router();

const todayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const serializeMess = ({ id, area, ...mess }) => ({
  _id: id,
  ...mess,
  area: area?.name || ""
});

const serializeMenuItem = ({ id, ...item }) => ({ _id: id, ...item });

const serializeMenu = ({ id, items, mess, ...menu }) => ({
  _id: id,
  ...menu,
  items: items.map(serializeMenuItem),
  ...(mess ? { messId: serializeMess(mess) } : {})
});

const getArea = async (value) => {
  const name = String(value || "").trim();
  if (!name) throw new Error("Area is required");

  const existingArea = await prisma.area.findFirst({
    where: { name: { equals: name, mode: "insensitive" } }
  });

  return existingArea || prisma.area.create({ data: { name } });
};

const menuData = (body) => ({
  date: new Date(body.date),
  mealType: String(body.mealType || "").toUpperCase(),
  price: body.price,
  availableQuantity: body.availableQuantity,
  isAvailable: body.isAvailable ?? true,
  dietaryType: String(body.dietaryType || "VEG").toUpperCase(),
  pickupAvailable: body.pickupAvailable ?? true,
  deliveryAvailable: body.deliveryAvailable ?? false
});

const menuItems = (items = []) => ({
  create: items.map((item) => ({
    name: item.name,
    description: item.description || "",
    category: item.category || "Meal",
    dietaryType: String(item.dietaryType || "VEG").toUpperCase()
  }))
});

const ownedMessWhere = (req, id) =>
  req.staffRole === "admin" ? { id } : { id, ownerId: req.auth.userId };

router.get("/", async (req, res) => {
  try {
    const messes = await prisma.mess.findMany({
      where: {
        approvalStatus: "approved",
        ...(req.query.area
          ? { area: { name: { equals: String(req.query.area), mode: "insensitive" } } }
          : {})
      },
      include: { area: true },
      orderBy: [{ rating: "desc" }, { name: "asc" }]
    });
    res.json(messes.map(serializeMess));
  } catch (error) {
    res.status(500).json({ message: "Unable to load messes." });
  }
});

router.get("/today", async (req, res) => {
  try {
    const { start, end } = todayRange();
    const menus = await prisma.menu.findMany({
      where: {
        date: { gte: start, lt: end },
        isAvailable: true,
        availableQuantity: { gt: 0 },
        ...(req.query.mealType ? { mealType: String(req.query.mealType).toUpperCase() } : {}),
        ...(req.query.dietaryType ? { dietaryType: String(req.query.dietaryType).toUpperCase() } : {}),
        mess: {
          approvalStatus: "approved",
          ...(req.query.area
            ? { area: { name: { equals: String(req.query.area), mode: "insensitive" } } }
            : {})
        }
      },
      include: { items: true, mess: { include: { area: true } } },
      orderBy: { price: "asc" }
    });
    res.json(menus.map(serializeMenu));
  } catch (error) {
    res.status(500).json({ message: "Unable to load today's menus." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const mess = await prisma.mess.findFirst({
      where: { id: req.params.id, approvalStatus: "approved" },
      include: { area: true }
    });
    if (!mess) return res.status(404).json({ message: "Mess not found." });

    const { start, end } = todayRange();
    const menus = await prisma.menu.findMany({
      where: { messId: mess.id, date: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { mealType: "asc" }
    });
    res.json({ mess: serializeMess(mess), menus: menus.map(serializeMenu) });
  } catch (error) {
    res.status(500).json({ message: "Unable to load mess details." });
  }
});

router.post("/", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    await syncClerkUser(req.staffUser);
    const area = await getArea(req.body.area);
    const mess = await prisma.mess.create({
      data: {
        ...req.body,
        area: undefined,
        ownerId: req.auth.userId,
        areaId: area.id
      },
      include: { area: true }
    });
    res.status(201).json(serializeMess(mess));
  } catch (error) {
    res.status(400).json({ message: "Please provide complete mess details." });
  }
});

router.post("/:id/menus", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const mess = await prisma.mess.findFirst({ where: ownedMessWhere(req, req.params.id) });
    if (!mess) return res.status(403).json({ message: "You can manage only your own mess." });

    const data = menuData(req.body);
    const menu = await prisma.menu.upsert({
      where: { messId_date_mealType: { messId: mess.id, date: data.date, mealType: data.mealType } },
      create: { ...data, messId: mess.id, items: menuItems(req.body.items) },
      update: { ...data, items: { deleteMany: {}, ...menuItems(req.body.items) } },
      include: { items: true }
    });
    res.status(201).json(serializeMenu(menu));
  } catch (error) {
    res.status(400).json({ message: "Please provide a valid dated meal menu." });
  }
});

router.patch("/:id/menus/:menuId", requireClerkAuth, requireShopkeeperOrAdmin, async (req, res) => {
  try {
    const mess = await prisma.mess.findFirst({ where: ownedMessWhere(req, req.params.id) });
    if (!mess) return res.status(403).json({ message: "You can manage only your own mess." });

    const menu = await prisma.menu.findFirst({ where: { id: req.params.menuId, messId: mess.id } });
    if (!menu) return res.status(404).json({ message: "Menu not found." });

    const data = menuData({ ...menu, ...req.body });
    const updatedMenu = await prisma.menu.update({
      where: { id: menu.id },
      data: {
        ...data,
        ...(req.body.items ? { items: { deleteMany: {}, ...menuItems(req.body.items) } } : {})
      },
      include: { items: true }
    });
    res.json(serializeMenu(updatedMenu));
  } catch (error) {
    res.status(400).json({ message: "Unable to update menu." });
  }
});

export default router;
