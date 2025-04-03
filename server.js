import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// MongoDB connection string (update with your credentials if needed)
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://abdulla:Abdulla123@cluster0.h8xjc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

let lessonsCollection;
let ordersCollection;

// Set up __dirname for static assets if needed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db("After_School");
    lessonsCollection = database.collection("lessons");
    ordersCollection = database.collection("orders");

    app.get("/", (req, res) => {
      res.send("API is running. Try /lessons or /orders.");
    });

    // A. GET /lessons – dynamically fetches and returns all lessons as JSON
    app.get("/lessons", async (req, res) => {
      try {
        const lessons = await lessonsCollection.find({}).toArray();
        res.json(lessons);
      } catch (error) {
        console.error("Error fetching lessons:", error);
        res.status(500).json({ error: "Failed to fetch lessons" });
      }
    });

    // NEW: GET /orders – dynamically fetches and returns all orders as JSON
    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.find({}).toArray();
        res.json(orders);
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
      }
    });

    // B. POST /orders – directly saves a new order to the "orders" collection
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

        // Process each lesson in the order
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

          // Enrich the order item with lesson details and remove the original "id"
          item.lessonId = lesson._id;
          item.lessonTopic = lesson.topic;
          delete item.id;
        }

        const result = await ordersCollection.insertOne(order);
        res
          .status(201)
          .json({ message: "Order created", orderId: result.insertedId });
      } catch (error) {
        console.error("Order error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // C. PUT /lessons/:id – updates any attribute of a lesson in the "lessons" collection
    app.put("/lessons/:id", async (req, res) => {
      try {
        const lessonId = req.params.id;
        const updateData = req.body;
        let updateQuery = {};

        // Allow specifying $set, $inc, or simply updating with the raw request body
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

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);
