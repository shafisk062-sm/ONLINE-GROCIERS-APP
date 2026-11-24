const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const nodemailer = require("nodemailer");
const cloudinary = require("cloudinary").v2;
const { z } = require("zod");
const { User, Admin, Address, Category, Product, Cart, Order, Payment, Coupon, Banner, Review } = require("./models");
const { issueToken, authenticate } = require("./auth");

const router = express.Router();
const customerOnly = authenticate(["customer"]);
const adminOnly = authenticate(["admin"]);
const addressInput = z.object({
  recipient: z.string().trim().min(2), phone: z.string().trim().min(7).max(20),
  line1: z.string().trim().min(4), line2: z.string().optional().default(""),
  city: z.string().trim().min(2), postalCode: z.string().trim().min(3).max(12)
});
function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error(result.error.issues[0].message);
    error.status = 400;
    throw error;
  }
  return result.data;
}
function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.post("/auth/register", async (req, res, next) => {
  try {
    const input = validate(z.object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(128)
    }), req.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return res.status(409).json({ message: "An account with this email already exists" });
    const user = await User.create({ ...input, email, password: await bcrypt.hash(input.password, 12) });
    res.status(201).json({ token: issueToken(user.id, "customer"), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

router.post("/auth/forgot-password", async (req, res, next) => {
  try {
    const { email } = validate(z.object({ email: z.string().email() }), req.body);
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      return res.status(503).json({ message: "Password reset email is not configured. Please contact store support." });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
      await user.save();
      const origin = process.env.APP_ORIGIN || process.env.CLIENT_ORIGIN || "http://localhost:5173";
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: "Reset your GreenBasket password",
        text: `Use this link within one hour to reset your password: ${origin}/?reset=${rawToken}`,
        html: `<p>Use this link within one hour to reset your GreenBasket password.</p><p><a href="${origin}/?reset=${rawToken}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
      });
    }
    res.json({ message: "If an account exists for that email, a password reset link is on its way." });
  } catch (error) { next(error); }
});

router.post("/auth/reset-password", async (req, res, next) => {
  try {
    const { token, password } = validate(z.object({ token: z.string().min(32), password: z.string().min(8).max(128) }), req.body);
    const resetHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ resetPasswordToken: resetHash, resetPasswordExpires: { $gt: Date.now() } }).select("+resetPasswordToken +resetPasswordExpires");
    if (!user) return res.status(400).json({ message: "This password reset link is invalid or has expired." });
    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: "Password updated. You can now sign in." });
  } catch (error) { next(error); }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = validate(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Email or password is incorrect" });
    res.json({ token: issueToken(user.id, "customer"), user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) { next(error); }
});

router.post("/auth/admin/login", async (req, res, next) => {
  try {
    const { email, password } = validate(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const admin = await Admin.findOne({ email: email.toLowerCase() }).select("+password");
    if (!admin || !(await bcrypt.compare(password, admin.password))) return res.status(401).json({ message: "Email or password is incorrect" });
    res.json({ token: issueToken(admin.id, "admin"), user: { id: admin.id, name: admin.name, email: admin.email }, role: "admin" });
  } catch (error) { next(error); }
});

router.get("/auth/me", authenticate(["customer", "admin"]), (req, res) => res.json({ user: req.account, role: req.role }));

router.get("/profile", customerOnly, async (req, res, next) => {
  try {
    const [user, addresses] = await Promise.all([
      User.findById(req.account.id).select("name email phone"),
      Address.find({ user: req.account.id }).sort({ isDefault: -1, createdAt: -1 })
    ]);
    res.json({ ...user.toObject(), addresses });
  } catch (error) { next(error); }
});

router.put("/profile", customerOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: z.string().trim().min(7).max(20).optional()
    }), req.body);
    res.json(await User.findByIdAndUpdate(req.account.id, input, { new: true, runValidators: true }).select("name email phone"));
  } catch (error) { next(error); }
});

router.post("/profile/addresses", customerOnly, async (req, res, next) => {
  try {
    const input = validate(addressInput.extend({ label: z.string().trim().min(1).max(40).optional().default("Home"), isDefault: z.boolean().optional().default(false) }), req.body);
    if (input.isDefault) await Address.updateMany({ user: req.account.id }, { isDefault: false });
    res.status(201).json(await Address.create({ ...input, user: req.account.id }));
  } catch (error) { next(error); }
});

router.delete("/profile/addresses/:id", customerOnly, async (req, res, next) => {
  try {
    const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.account.id });
    if (!address) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address deleted" });
  } catch (error) { next(error); }
});

router.get("/categories", async (req, res, next) => {
  try { res.json(await Category.find().sort({ name: 1 })); } catch (error) { next(error); }
});

router.get("/banners", async (req, res, next) => {
  try {
    const now = new Date();
    res.json(await Banner.find({
      active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }
      ]
    }).sort({ createdAt: -1 }));
  } catch (error) { next(error); }
});

router.get("/products", async (req, res, next) => {
  try {
    const { search, category, minPrice, maxPrice, available, discounted, sort, featured } = req.query;
    const filter = { isActive: true };
    if (search && (typeof search !== "string" || search.length > 100)) return res.status(400).json({ message: "Search must be 100 characters or fewer" });
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [{ name: { $regex: safeSearch, $options: "i" } }, { brand: { $regex: safeSearch, $options: "i" } }];
    }
    if (category) {
      const match = await Category.findOne({ slug: category }) || await Category.findOne({ name: new RegExp(`^${escapeRegex(category)}$`, "i") });
      if (!match) return res.json([]);
      filter.category = match._id;
    }
    if (minPrice || maxPrice) filter.price = {};
    for (const [label, value] of [["Minimum", minPrice], ["Maximum", maxPrice]]) {
      if (value !== undefined && (!/^\d+(\.\d{1,2})?$/.test(String(value)) || Number(value) < 0)) {
        return res.status(400).json({ message: `${label} price must be a non-negative number` });
      }
    }
    if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    if (available === "true") filter.quantity = { $gt: 0 };
    if (discounted === "true") filter.$expr = { $lt: ["$price", "$originalPrice"] };
    if (featured === "true") filter.featured = true;
    const sorts = { "price-asc": { price: 1 }, "price-desc": { price: -1 }, popular: { popularity: -1 }, rating: { rating: -1 }, newest: { createdAt: -1 } };
    const products = await Product.find(filter).populate("category", "name slug icon").sort(sorts[sort] || { featured: -1, popularity: -1 });
    res.json(products);
  } catch (error) { next(error); }
});

router.get("/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate("category", "name slug icon");
    if (!product || !product.isActive) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) { next(error); }
});

router.get("/cart", customerOnly, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.account.id }).populate("items.product");
    res.json(cart || { items: [], coupon: "" });
  } catch (error) { next(error); }
});

router.put("/cart", customerOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      items: z.array(z.object({ product: z.string().length(24), quantity: z.number().int().min(1).max(99) })).max(100),
      coupon: z.string().max(40).optional().default("")
    }), req.body);
    const productIds = input.items.map((item) => item.product);
    const products = await Product.find({ _id: { $in: productIds }, isActive: true });
    if (products.length !== new Set(productIds).size) return res.status(400).json({ message: "One or more products are unavailable" });
    const insufficient = input.items.find((item) => {
      const product = products.find((entry) => entry.id === item.product);
      return !product || item.quantity > product.quantity;
    });
    if (insufficient) return res.status(409).json({ message: "Requested quantity exceeds available stock" });
    const cart = await Cart.findOneAndUpdate(
      { user: req.account.id }, { $set: { items: input.items, coupon: input.coupon } },
      { new: true, upsert: true, runValidators: true }
    ).populate("items.product");
    res.json(cart);
  } catch (error) { next(error); }
});

router.get("/orders", customerOnly, async (req, res, next) => {
  try { res.json(await Order.find({ user: req.account.id }).sort({ createdAt: -1 })); } catch (error) { next(error); }
});

router.post("/orders", customerOnly, async (req, res, next) => {
  try {
    const { address, paymentMethod = "cod", coupon = "" } = validate(z.object({
      address: addressInput, paymentMethod: z.enum(["cod", "razorpay"]).default("cod"),
      coupon: z.string().max(40).optional().default("")
    }), req.body);
    const cart = await Cart.findOne({ user: req.account.id });
    if (!cart || !cart.items.length) return res.status(400).json({ message: "Your cart is empty" });
    const ids = cart.items.map((item) => item.product);
    const products = await Product.find({ _id: { $in: ids }, isActive: true });
    if (products.length !== ids.length) return res.status(409).json({ message: "A product in your cart is no longer available" });
    const orderItems = cart.items.map((item) => {
      const product = products.find((entry) => entry.id === item.product.toString());
      if (!product || product.quantity < item.quantity) throw Object.assign(new Error(`${product?.name || "A product"} has insufficient stock`), { status: 409 });
      return { product: product.id, name: product.name, image: product.image, unit: product.unit, price: product.price, quantity: item.quantity };
    });
    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discount = 0;
    if (coupon) {
      const validCoupon = await Coupon.findOne({
        code: coupon.toUpperCase(), active: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
      });
      if (!validCoupon || subtotal < validCoupon.minimumOrder) return res.status(400).json({ message: "This coupon is not valid for your order" });
      discount = Math.round(subtotal * validCoupon.discountPercent) / 100;
    }
    const deliveryFee = subtotal >= 499 ? 0 : 39;
    const order = await Order.create({
      orderId: `GB${Date.now().toString().slice(-8)}${crypto.randomInt(100, 999)}`,
      user: req.account.id, items: orderItems, address, subtotal, deliveryFee, discount,
      total: Math.max(0, subtotal + deliveryFee - discount), paymentMethod,
      paymentStatus: paymentMethod === "razorpay" ? "pending" : "pending"
    });
    if (paymentMethod === "razorpay") {
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        await Order.findByIdAndDelete(order.id);
        return res.status(503).json({ message: "Online payment is not configured. Please choose cash on delivery." });
      }
      const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      const gatewayOrder = await gateway.orders.create({ amount: Math.round(order.total * 100), currency: "INR", receipt: order.orderId });
      await Payment.create({ order: order.id, provider: "razorpay", providerOrderId: gatewayOrder.id, amount: order.total });
      order.paymentStatus = "pending";
      await order.save();
      return res.status(201).json({ order, razorpay: { key: process.env.RAZORPAY_KEY_ID, orderId: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency } });
    }
    const reserved = [];
    for (const item of cart.items) {
      const updated = await Product.findOneAndUpdate({ _id: item.product, quantity: { $gte: item.quantity } }, { $inc: { quantity: -item.quantity, popularity: item.quantity } });
      if (!updated) {
        if (reserved.length) await Product.bulkWrite(reserved.map((reservedItem) => ({
          updateOne: { filter: { _id: reservedItem.product }, update: { $inc: { quantity: reservedItem.quantity, popularity: -reservedItem.quantity } } }
        })));
        await Order.findByIdAndDelete(order.id);
        return res.status(409).json({ message: "Stock changed while placing your order. Please review your cart." });
      }
      reserved.push(item);
    }
    await Cart.findOneAndUpdate({ user: req.account.id }, { items: [], coupon: "" });
    await Payment.create({ order: order.id, provider: "cod", amount: order.total, status: "created" });
    res.status(201).json({ order });
  } catch (error) { next(error); }
});

router.post("/payments/razorpay/verify", customerOnly, async (req, res, next) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = validate(z.object({
      orderId: z.string(), razorpayOrderId: z.string(), razorpayPaymentId: z.string(), razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i)
    }), req.body);
    if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ message: "Payment verification is not configured" });
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpaySignature))) return res.status(400).json({ message: "Payment signature is invalid" });
    const payment = await Payment.findOne({ providerOrderId: razorpayOrderId }).populate("order");
    if (!payment || !payment.order || payment.order.user.toString() !== req.account.id) return res.status(404).json({ message: "Payment order not found" });
    if (payment.order.orderId !== orderId) return res.status(400).json({ message: "Order does not match payment" });
    if (payment.status === "paid") {
      if (payment.providerPaymentId !== razorpayPaymentId) return res.status(409).json({ message: "This payment order has already been completed" });
      return res.json({ order: payment.order });
    }
    const claimedPayment = await Payment.findOneAndUpdate({ _id: payment.id, status: "created" }, { status: "processing" }, { new: true });
    if (!claimedPayment) return res.status(409).json({ message: "This payment is already being processed" });
    const order = payment.order;
    const reserved = [];
    for (const item of order.items) {
      const updated = await Product.findOneAndUpdate({ _id: item.product, quantity: { $gte: item.quantity } }, { $inc: { quantity: -item.quantity, popularity: item.quantity } });
      if (!updated) {
        if (reserved.length) await Product.bulkWrite(reserved.map((reservedItem) => ({
          updateOne: { filter: { _id: reservedItem.product }, update: { $inc: { quantity: reservedItem.quantity, popularity: -reservedItem.quantity } } }
        })));
        claimedPayment.status = "failed";
        await claimedPayment.save();
        return res.status(409).json({ message: "Payment received, but inventory needs support. Contact customer care." });
      }
      reserved.push(item);
    }
    claimedPayment.providerPaymentId = razorpayPaymentId;
    claimedPayment.status = "paid";
    await claimedPayment.save();
    order.paymentStatus = "paid";
    order.status = "Confirmed";
    await order.save();
    await Cart.findOneAndUpdate({ user: req.account.id }, { items: [], coupon: "" });
    res.json({ order });
  } catch (error) { next(error); }
});

router.post("/coupons/validate", customerOnly, async (req, res, next) => {
  try {
    const { code, subtotal } = validate(z.object({ code: z.string().min(2), subtotal: z.number().min(0) }), req.body);
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
    if (!coupon || subtotal < coupon.minimumOrder) return res.status(400).json({ message: "Coupon is invalid or your order does not meet the minimum" });
    res.json({ code: coupon.code, discount: Math.round(subtotal * coupon.discountPercent) / 100 });
  } catch (error) { next(error); }
});

router.post("/reviews", customerOnly, async (req, res, next) => {
  try {
    const { product, rating, comment = "" } = validate(z.object({ product: z.string().length(24), rating: z.number().int().min(1).max(5), comment: z.string().max(1000) }), req.body);
    const review = await Review.findOneAndUpdate({ product, user: req.account.id }, { rating, comment }, { upsert: true, new: true, runValidators: true });
    const stats = await Review.aggregate([{ $match: { product: review.product } }, { $group: { _id: "$product", rating: { $avg: "$rating" }, count: { $sum: 1 } } }]);
    if (stats[0]) await Product.findByIdAndUpdate(product, { rating: stats[0].rating, reviewCount: stats[0].count });
    res.status(201).json(review);
  } catch (error) { next(error); }
});

router.get("/admin/overview", adminOnly, async (req, res, next) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const [products, customers, orders, revenue, recentOrders, bestSellers, monthlySales] = await Promise.all([
      Product.countDocuments({ isActive: true }), User.countDocuments(), Order.countDocuments(),
      Order.aggregate([{ $match: { paymentStatus: { $in: ["paid", "pending"] }, status: { $ne: "Cancelled" } } }, { $group: { _id: null, total: { $sum: "$total" } } }]),
      Order.find().sort({ createdAt: -1 }).limit(8).populate("user", "name email"),
      Product.find().sort({ popularity: -1 }).limit(5).select("name popularity quantity image price"),
      Order.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo }, paymentStatus: { $in: ["paid", "pending"] }, status: { $ne: "Cancelled" } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }, total: { $sum: "$total" } } },
        { $project: { _id: 0, period: "$_id", total: 1 } }, { $sort: { period: 1 } }
      ])
    ]);
    res.json({ products, customers, orders, revenue: revenue[0]?.total || 0, recentOrders, bestSellers, monthlySales });
  } catch (error) { next(error); }
});

router.get("/admin/products", adminOnly, async (req, res, next) => {
  try { res.json(await Product.find().populate("category", "name slug").sort({ updatedAt: -1 })); } catch (error) { next(error); }
});
router.post("/admin/uploads/signature", adminOnly, async (req, res, next) => {
  try {
    const config = {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    };
    if (!config.cloud_name || !config.api_key || !config.api_secret) return res.status(503).json({ message: "Image uploads are not configured. You can still use an image URL." });
    const params = {
      timestamp: Math.floor(Date.now() / 1000),
      folder: "greenbasket/products",
      public_id: `product-${crypto.randomBytes(12).toString("hex")}`
    };
    res.json({
      cloudName: config.cloud_name,
      apiKey: config.api_key,
      ...params,
      signature: cloudinary.utils.api_sign_request(params, config.api_secret)
    });
  } catch (error) { next(error); }
});
router.get("/admin/orders", adminOnly, async (req, res, next) => {
  try { res.json(await Order.find().sort({ createdAt: -1 }).populate("user", "name email")); } catch (error) { next(error); }
});
router.get("/admin/customers", adminOnly, async (req, res, next) => {
  try { res.json(await User.find().select("name email phone createdAt").sort({ createdAt: -1 })); } catch (error) { next(error); }
});
router.post("/admin/products", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      name: z.string().trim().min(2), description: z.string().optional().default(""),
      brand: z.string().optional().default("GreenBasket"), category: z.string().length(24),
      image: z.string().url(), price: z.number().min(0), originalPrice: z.number().min(0),
      quantity: z.number().int().min(0), unit: z.string().min(1), rating: z.number().min(0).max(5).optional().default(4.5)
    }), req.body);
    const product = await Product.create({ ...input, slug: `${slugify(input.name)}-${Date.now().toString(36)}` });
    res.status(201).json(await product.populate("category", "name slug"));
  } catch (error) { next(error); }
});
router.patch("/admin/products/:id", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      name: z.string().trim().min(2).optional(), description: z.string().optional(),
      brand: z.string().optional(), category: z.string().length(24).optional(),
      image: z.string().url().optional(), price: z.number().min(0).optional(),
      originalPrice: z.number().min(0).optional(), quantity: z.number().int().min(0).optional(),
      unit: z.string().min(1).optional(), featured: z.boolean().optional(), isActive: z.boolean().optional()
    }), req.body);
    const product = await Product.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true }).populate("category", "name slug");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) { next(error); }
});
router.delete("/admin/products/:id", adminOnly, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product archived" });
  } catch (error) { next(error); }
});
router.patch("/admin/orders/:id", adminOnly, async (req, res, next) => {
  try {
    const { status } = validate(z.object({ status: z.enum(["Order Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"]) }), req.body);
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "Cancelled" && status !== "Cancelled") return res.status(409).json({ message: "Cancelled orders cannot be reopened" });
    if (status === "Cancelled" && order.status !== "Cancelled" && (order.paymentMethod === "cod" || order.paymentStatus === "paid")) {
      await Product.bulkWrite(order.items.map((item) => ({
        updateOne: { filter: { _id: item.product }, update: { $inc: { quantity: item.quantity, popularity: -item.quantity } } }
      })));
    }
    order.status = status;
    await order.save();
    await Payment.updateMany({ order: order.id, status: { $ne: "paid" } }, { status: "failed" });
    await order.populate("user", "name email");
    res.json(order);
  } catch (error) { next(error); }
});
router.get("/admin/categories", adminOnly, async (req, res, next) => {
  try { res.json(await Category.find().sort({ name: 1 })); } catch (error) { next(error); }
});
router.get("/admin/coupons", adminOnly, async (req, res, next) => {
  try { res.json(await Coupon.find().sort({ createdAt: -1 })); } catch (error) { next(error); }
});
router.post("/admin/coupons", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
      discountPercent: z.number().int().min(1).max(100),
      minimumOrder: z.number().min(0).optional().default(0),
      expiresAt: z.string().datetime().optional()
    }), req.body);
    res.status(201).json(await Coupon.create({ ...input, expiresAt: input.expiresAt || undefined }));
  } catch (error) { next(error); }
});
router.patch("/admin/coupons/:id", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({ active: z.boolean() }), req.body);
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, input, { new: true });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (error) { next(error); }
});
router.get("/admin/banners", adminOnly, async (req, res, next) => {
  try { res.json(await Banner.find().sort({ createdAt: -1 })); } catch (error) { next(error); }
});
router.post("/admin/banners", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      eyebrow: z.string().trim().min(2).max(100), title: z.string().trim().min(2).max(120),
      subtitle: z.string().max(250).optional().default(""), offerLabel: z.string().max(50).optional().default(""),
      offerCode: z.string().max(40).optional().default(""), image: z.string().url().optional(),
      active: z.boolean().optional().default(true)
    }), req.body);
    res.status(201).json(await Banner.create(input));
  } catch (error) { next(error); }
});
router.patch("/admin/banners/:id", adminOnly, async (req, res, next) => {
  try {
    const input = validate(z.object({
      eyebrow: z.string().trim().min(2).max(100).optional(), title: z.string().trim().min(2).max(120).optional(),
      subtitle: z.string().max(250).optional(), offerLabel: z.string().max(50).optional(),
      offerCode: z.string().max(40).optional(), image: z.string().url().optional(), active: z.boolean().optional()
    }), req.body);
    const banner = await Banner.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    res.json(banner);
  } catch (error) { next(error); }
});
router.delete("/admin/banners/:id", adminOnly, async (req, res, next) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    res.json({ message: "Banner deleted" });
  } catch (error) { next(error); }
});
router.post("/admin/categories", adminOnly, async (req, res, next) => {
  try {
    const { name, icon = "🛒", description = "" } = validate(z.object({ name: z.string().trim().min(2), icon: z.string().max(8), description: z.string().max(200) }), req.body);
    res.status(201).json(await Category.create({ name, icon, description, slug: slugify(name) }));
  } catch (error) { next(error); }
});
router.delete("/admin/categories/:id", adminOnly, async (req, res, next) => {
  try {
    if (await Product.exists({ category: req.params.id, isActive: true })) return res.status(409).json({ message: "Move or archive this category's products first" });
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
