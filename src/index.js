import dotenv from "dotenv";
import connectDB from "./db/index.js";
// import { app } from "./app.js";
import { initializeRoutes } from "./app.js";
import { Server } from "socket.io";
import http from "http";
import { DRIVER_ONLINE, DISCONNECT } from "./constants.js";

dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
    console.log("Connected to database");

    const server = http.createServer();

    // Initialize Socket.IO
    const io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      },
    });

    const app = initializeRoutes(io);
    // Track active drivers and their socket connections
    const activeDrivers = new Map();

    // Socket.IO connection handler
    io.on("connection", (socket) => {
      console.log("A user connected:", socket.id);

      // Handle driver connection
      socket.on(DRIVER_ONLINE, async (driverId) => {
        activeDrivers.set(driverId, socket.id); // Map driver ID to socket ID
        console.log(`Driver ${driverId} is now online`);
      });

      // Handle driver disconnection
      socket.on(DISCONNECT, () => {
        for (const [driverId, socketId] of activeDrivers.entries()) {
          if (socketId === socket.id) {
            activeDrivers.delete(driverId);
            console.log(`Driver ${driverId} disconnected`);
            break;
          }
        }
      });
    });

    //Attach Express app to server
    server.on("request", app);

    server.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log("MongoDB connection failed: " + err);
  });
