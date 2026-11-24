require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Category, Product, Admin, Coupon, Banner } = require("./models");
const catalog = require("../shared/catalog.json");

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart-grocery");
  const categoryDocs = {};
  for (const category of catalog.categories) {
    const slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    categoryDocs[category.name] = await Category.findOneAndUpdate({ slug }, { ...category, slug }, { upsert: true, new: true });
  }
  for (const [index, product] of catalog.products.entries()) {
    const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await Product.findOneAndUpdate(
      { slug },
      { ...product, slug, brand: index % 3 === 0 ? "GreenBasket Organic" : "GreenBasket Select", category: categoryDocs[product.category]._id, rating: 4.5 + (index % 5) / 10, reviewCount: 18 + index * 3, featured: index < 6, popularity: 100 - index * 3, isActive: true },
      { upsert: true, new: true }
    );
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.toLowerCase();
    await Admin.findOneAndUpdate(
      { email },
      { name: process.env.ADMIN_NAME || "Store Admin", email, password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12) },
      { upsert: true, new: true }
    );
  }
  await Coupon.findOneAndUpdate(
    { code: "FRESH25" },
    { code: "FRESH25", discountPercent: 25, minimumOrder: 399, active: true },
    { upsert: true, new: true }
  );
  if (!await Banner.exists({ title: "Little things. Big savings." })) {
    await Banner.create({
      eyebrow: "A FRESH START TO YOUR WEEK",
      title: "Little things. Big savings.",
      subtitle: "Stock up on pantry favourites and save on every basket.",
      offerLabel: "UP TO 25% OFF YOUR FAVOURITES",
      offerCode: "FRESH25",
      active: true
    });
  }
  console.log(`Seeded ${catalog.categories.length} categories and ${catalog.products.length} products.`);
  await mongoose.disconnect();
}

seed().catch((error) => { console.error(error); process.exit(1); });
