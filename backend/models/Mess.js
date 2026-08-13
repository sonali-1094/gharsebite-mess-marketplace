import mongoose from "mongoose";

const messSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  address: { type: String, required: true },
  area: { type: String, required: true, index: true },
  latitude: Number,
  longitude: Number,
  serviceRadius: { type: Number, default: 3 },
  phone: { type: String, default: "" },
  coverImage: { type: String, default: "" },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  deliveryAvailable: { type: Boolean, default: false },
  pickupAvailable: { type: Boolean, default: true },
  deliveryCharge: { type: Number, default: 0, min: 0 },
  openingTime: { type: String, default: "07:00" },
  closingTime: { type: String, default: "22:00" },
  approvalStatus: { type: String, enum: ["pending", "approved", "suspended"], default: "pending" }
}, { timestamps: true });

export default mongoose.model("Mess", messSchema);
