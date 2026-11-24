const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const addressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  label: { type: String, default: "Home" },
  recipient: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  line2: String,
  city: { type: String, required: true },
  postalCode: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false },
  phone: String
}, { timestamps: true });

const adminSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false }
}, { timestamps: true });

const categorySchema = new Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  icon: { type: String, default: "🛒" },
  description: String
}, { timestamps: true });

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  brand: { type: String, default: "GreenBasket" },
  category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
  image: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  unit: { type: String, required: true, default: "each" },
  rating: { type: Number, min: 0, max: 5, default: 4.5 },
  reviewCount: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  popularity: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const cartItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, min: 1, required: true }
});
const cartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  items: [cartItemSchema],
  coupon: { type: String, default: "" }
}, { timestamps: true });

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product" },
  name: String,
  image: String,
  unit: String,
  price: Number,
  quantity: Number
});
const orderSchema = new Schema({
  orderId: { type: String, unique: true, required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  items: [orderItemSchema],
  address: addressSchema,
  subtotal: Number,
  deliveryFee: Number,
  discount: { type: Number, default: 0 },
  total: Number,
  paymentMethod: { type: String, enum: ["cod", "razorpay"], default: "cod" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  status: { type: String, enum: ["Order Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"], default: "Order Placed" }
}, { timestamps: true });

const paymentSchema = new Schema({
  order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
  provider: { type: String, required: true },
  providerOrderId: String,
  providerPaymentId: String,
  amount: Number,
  status: { type: String, enum: ["created", "processing", "paid", "failed"], default: "created" }
}, { timestamps: true });

const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountPercent: { type: Number, required: true, min: 1, max: 100 },
  minimumOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  expiresAt: Date
}, { timestamps: true });

const bannerSchema = new Schema({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  offerLabel: { type: String, default: "" },
  offerCode: { type: String, default: "" },
  image: String,
  active: { type: Boolean, default: true },
  startsAt: Date,
  endsAt: Date
}, { timestamps: true });

const reviewSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 1000 }
}, { timestamps: true });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = {
  User: model("User", userSchema),
  Address: model("Address", addressSchema),
  Admin: model("Admin", adminSchema),
  Category: model("Category", categorySchema),
  Product: model("Product", productSchema),
  Cart: model("Cart", cartSchema),
  Order: model("Order", orderSchema),
  Payment: model("Payment", paymentSchema),
  Coupon: model("Coupon", couponSchema),
  Banner: model("Banner", bannerSchema),
  Review: model("Review", reviewSchema)
};
