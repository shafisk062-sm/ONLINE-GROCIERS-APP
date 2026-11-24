require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));
app.use("/api", require("./routes"));
app.use((req, res) => res.status(404).json({ message: "Endpoint not found" }));
app.use((error, req, res, next) => {
  console.error(error);
  if (error.code === 11000) return res.status(409).json({ message: "This value is already in use" });
  if (error.name === "CastError") return res.status(400).json({ message: "Invalid resource identifier" });
  res.status(error.status || 500).json({ message: error.message || "Internal server error" });
});

const port = Number(process.env.PORT) || 5000;
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart-grocery")
  .then(() => app.listen(port, () => console.log(`GreenBasket API listening on ${port}`)))
  .catch((error) => {
    console.error("Could not connect to MongoDB:", error.message);
    process.exit(1);
  });
