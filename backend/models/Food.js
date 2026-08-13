import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  image: {
    type: String
  },
  description: {
    type: String
  },
  cuisine: {
    type: String,
    default: ""
  },
  tags: {
    type: [String],
    default: []
  },
  chefId: {
    type: String,
    default: ""
  },
  chefName: {
    type: String,
    default: ""
  },
  shopkeeperId: {
    type: String,
    default: ""
  },
  shopName: {
    type: String,
    default: ""
  },
  isTodayMenu: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

export default mongoose.model("Food", foodSchema);
