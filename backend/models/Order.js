import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  items: [
    {
      foodId: {
        type: String
      },
      name: String,
      price: Number,
      quantity: Number,
      shopkeeperId: {
        type: String,
        default: ""
      },
      chefId: {
        type: String,
        default: ""
      },
      shopName: {
        type: String,
        default: ""
      },
      chefName: {
        type: String,
        default: ""
      }
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  messId: { type: String, default: "" },
  orderType: { type: String, enum: ["PICKUP", "DELIVERY"], default: "DELIVERY" },
  deliveryCharge: { type: Number, default: 0 },
  address: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["Pending", "Accepted", "Preparing", "Ready for Pickup", "Out for Delivery", "Delivered", "Completed", "Cancelled", "Rejected"],
    default: "Pending"
  },
  shopkeeperId: {
    type: String,
    default: ""
  },
  chefId: {
    type: String,
    default: ""
  },
  shopName: {
    type: String,
    default: ""
  },
  chefName: {
    type: String,
    default: ""
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Processing", "Paid", "Failed"],
    default: "Pending"
  },
  paymentMethod: {
    type: String,
    enum: ["COD", "CARD", "UPI", "NET_BANKING", "RAZORPAY"],
    default: "COD"
  },
  paymentId: {
    type: String,
    default: ""
  },
  paidAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

export default mongoose.model("Order", orderSchema);
