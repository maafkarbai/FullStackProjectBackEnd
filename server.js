// server.js
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

// 1. Create the Express app
const app = express();
const port = process.env.PORT || 3000;

// 2. Middleware
app.use(express.json());

// Manual CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 3. Serve static files (e.g., lesson images) from the "images" folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/images", express.static(path.join(__dirname, "images")));

// 4. MongoDB connection setup
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdulla:Abdulla123@cluster0.h8xjc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// 5. Declare collections (to be set after connection)
let lessonsCollection;
let ordersCollection;

// 6. Main async function to connect to MongoDB and define routes
async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    // Use the exact database name (adjust if needed)
    const database = client.db("After_School");
    lessonsCollection = database.collection("lessons");
    ordersCollection = database.collection("orders");

    // GET /lessons – returns all lessons (maps _id to id for frontend convenience)
    app.get("/lessons", async (req, res) => {
      try {
        const rawDocs = await lessonsCollection.find({}).toArray();
        const lessons = rawDocs.map((doc) => ({
          ...doc,
          id: doc._id,
        }));
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
      }
    });

    // POST /orders – processes an order and updates lesson availability
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;
        // Validate required order fields and that a non-empty lessons array exists
        if (
          !order.firstName ||
          !order.lastName ||
          !order.phone ||
          !order.method ||
          !order.lessons ||
          !Array.isArray(order.lessons) ||
          order.lessons.length === 0
        ) {
          return res.status(400).json({
            error:
              "Missing required order fields or lessons. Order must include firstName, lastName, phone, method, and a non-empty lessons array.",
          });
        }

        // For each ordered lesson, validate the lesson exists and that enough slots are available.
        for (const orderItem of order.lessons) {
          if (!orderItem.id || !orderItem.quantity) {
            return res
              .status(400)
              .json({ error: "Each order item must include id and quantity" });
          }
          const lesson = await lessonsCollection.findOne({
            _id: new ObjectId(orderItem.id),
          });
          if (!lesson) {
            return res
              .status(404)
              .json({ error: `Lesson with id ${orderItem.id} not found` });
          }
          if (lesson.Space < orderItem.quantity) {
            return res.status(400).json({
              error: `Not enough available slots for lesson ${lesson.LessonName}. Available: ${lesson.Space}`,
            });
          }
        }

        // Update each lesson's available slots by decrementing "Space"
        for (const orderItem of order.lessons) {
          await lessonsCollection.updateOne(
            { _id: new ObjectId(orderItem.id) },
            { $inc: { Space: -orderItem.quantity } }
          );
        }

        // Insert the order into the orders collection
        const result = await ordersCollection.insertOne(order);
        res
          .status(201)
          .json({ message: "Order created", orderId: result.insertedId });
      } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ error: "Failed to create order" });
      }
    });

    // PUT /lessons/:id – updates a lesson document (optional: for admin adjustments)
    app.put("/lessons/:id", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const updateData = req.body;
        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(lessonId) },
          { $set: updateData }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Lesson not found" });
        }
        res.json({ message: "Lesson updated" });
      } catch (error) {
        console.error("Error updating lesson:", error);
        res.status(500).json({ error: "Failed to update lesson" });
      }
    });

    // 7. Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);
