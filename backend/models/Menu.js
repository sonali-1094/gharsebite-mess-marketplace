import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  category: { type: String, default: "Meal" },
  dietaryType: { type: String, enum: ["VEG", "JAIN", "NON_VEG"], default: "VEG" }
}, { _id: true });

const menuSchema = new mongoose.Schema({
  messId: { type: mongoose.Schema.Types.ObjectId, ref: "Mess", required: true, index: true },
  date: { type: Date, required: true, index: true },
  mealType: { type: String, enum: ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"], required: true },
  items: { type: [menuItemSchema], default: [] },
  price: { type: Number, required: true, min: 0 },
  availableQuantity: { type: Number, required: true, min: 0 },
  isAvailable: { type: Boolean, default: true },
  dietaryType: { type: String, enum: ["VEG", "JAIN", "NON_VEG"], default: "VEG" },
  pickupAvailable: { type: Boolean, default: true },
  deliveryAvailable: { type: Boolean, default: false }
}, { timestamps: true });

menuSchema.index({ messId: 1, date: 1, mealType: 1 }, { unique: true });
export default mongoose.model("Menu", menuSchema);
