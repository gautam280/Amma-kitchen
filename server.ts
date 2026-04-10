import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "amma-kitchen-secret";

// Twilio Client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

app.use(cors());
app.use(express.json());

// In-memory "Database"
const users: any[] = [];
const orders: any[] = [];

// Helper: Send SMS
async function sendSMS(message: string) {
  const to = process.env.NOTIFY_MOBILE_NUMBER;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (twilioClient && to && from) {
    try {
      await twilioClient.messages.create({ body: message, to, from });
      console.log("SMS Sent successfully");
    } catch (error) {
      console.error("Failed to send SMS:", error);
    }
  } else {
    console.log("[MOCK SMS]:", message);
  }
}

// --- API Routes ---

// Auth: Sign Up
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, phone, password } = req.body;
  
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now().toString(), name, email, phone, password: hashedPassword };
  users.push(newUser);

  // Notify Admin
  await sendSMS(`New user signed up: ${name}, ${phone}`);

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET);
  res.json({ token, user: { id: newUser.id, name, email, phone } });
});

// Auth: Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Notify Admin
  await sendSMS(`New user logged in: ${user.name}, ${user.phone}`);

  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
});

// Orders: Place Order
app.post("/api/orders", async (req, res) => {
  const { userId, items, totalPrice, customerName, customerPhone } = req.body;
  
  const newOrder = {
    id: `ORD-${Date.now()}`,
    userId,
    items,
    totalPrice,
    customerName,
    customerPhone,
    status: "Pending",
    createdAt: new Date()
  };
  
  orders.push(newOrder);

  // Notify Admin
  const itemsSummary = items.map((i: any) => `${i.name} (x${i.quantity})`).join(", ");
  await sendSMS(`New Order: ${customerName}, ${customerPhone}, Items: ${itemsSummary}, Total: ₹${totalPrice}`);

  res.json({ message: "Order placed successfully", orderId: newOrder.id });
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
