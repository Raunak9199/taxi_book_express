import mongoose, { Schema } from "mongoose";

const bookingSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: false, // Initially null until a driver is assigned
    },
    pickupLocation: {
      type: {
        type: String, // GeoJSON type (e.g., "Point")
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: String,
    },
    dropLocation: {
      type: {
        type: String, // GeoJSON type (e.g., "Point")
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: String,
    },
    fare: {
      type: Number,
      required: false, // Calculated during the booking process
    },
    distance: {
      type: Number,
      required: true, // Calculated based on pickup/drop coordinates
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Ongoing", "Completed", "Cancelled"],
      default: "Pending",
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },
    bookingTime: {
      type: Date,
      default: Date.now,
    },
    eta: { type: String }, // From Google Maps
    ridePreferences: {
      carType: { type: String }, // e.g., carType: "SUV", passengers: 4
      passengers: { type: Number },
    },
    paymentMethod: { type: String }, // e.g., "Cash", "Card"
  },
  { timestamps: true }
);

bookingSchema.index({ pickupLocation: "2dsphere" });

export const Booking = mongoose.model("Booking", bookingSchema);
