import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// 1. Middleware: Parse JSON bodies
app.use(express.json());

// Manual CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 2. Serve static files (e.g., lesson images) from the "images" folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/images", express.static(path.join(__dirname, "images")));

// 3. MongoDB connection
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdulla:Abdulla123@cluster0.h8xjc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

let lessonsCollection;
let ordersCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db("After_School");
    lessonsCollection = database.collection("lessons");
    ordersCollection = database.collection("orders");

    // A. GET /lessons – returns all lessons as JSON
    app.get("/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection.find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
      }
    });

    // B. POST /orders – saves a new order to the "orders" collection
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        // Validate required fields
        if (
          !order.firstName ||
          !order.lastName ||
          !order.phone ||
          !order.method ||
          !Array.isArray(order.lessons) ||
          order.lessons.length === 0
        ) {
          return res.status(400).json({ error: "Missing required fields." });
        }

        const nameRegex = /^[A-Za-z]+$/;
        const phoneRegex = /^[0-9]{7,15}$/;
        const zipRegex = /^\d{5}$/;

        if (!nameRegex.test(order.firstName.trim())) {
          return res.status(400).json({ error: "Invalid first name." });
        }
        if (!nameRegex.test(order.lastName.trim())) {
          return res.status(400).json({ error: "Invalid last name." });
        }
        if (!phoneRegex.test(order.phone)) {
          return res.status(400).json({ error: "Invalid phone number." });
        }
        if (order.method === "Home Delivery") {
          if (!order.address || order.address.trim().length === 0) {
            return res.status(400).json({ error: "Address is required." });
          }
          if (!zipRegex.test(String(order.zip))) {
            return res.status(400).json({ error: "Invalid ZIP code." });
          }
        }

        // Process each lesson in the order: check availability and update lesson details
        for (const item of order.lessons) {
          // Expect the client to send an "id" field for the lesson
          const lesson = await lessonsCollection.findOne({
            _id: new ObjectId(item.id),
          });
          if (!lesson || lesson.space < item.quantity) {
            return res.status(400).json({
              error: `Not enough space in ${lesson?.topic || "lesson"}.`,
            });
          }

          // Update the available space (this example assumes you'll update the lesson separately via PUT)
          // Alternatively, you can update the lesson here using $inc as in your business logic.

          // Enrich the order item with the lesson's _id and topic
          item.lessonId = lesson._id;
          item.lessonTopic = lesson.topic;

          // Remove the original "id" field to avoid confusion
          delete item.id;
        }

        // Insert the new order into the orders collection
        const result = await ordersCollection.insertOne(order);
        res
          .status(201)
          .json({ message: "Order created", orderId: result.insertedId });
      } catch (error) {
        console.error("Order error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // C. PUT /lessons/:id – updates any attribute in a lesson in the "lessons" collection
    // This route is flexible: if no $set or $inc operators are provided, it assumes the request body is the new data.
    app.put("/lessons/:id", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const updateData = req.body;
        let updateQuery = {};

        // Allow the client to specify the update operator ($set, $inc) or simply send an object to update directly.
        if (updateData.$inc) updateQuery.$inc = updateData.$inc;
        if (updateData.$set) updateQuery.$set = updateData.$set;
        if (!updateQuery.$set && !updateQuery.$inc) {
          updateQuery.$set = updateData;
        }

        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(lessonId) },
          updateQuery
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

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);
