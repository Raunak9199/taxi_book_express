import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Base User Schema
const userSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-zA-Z0-9]+$/,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    },
    phoneNumber: { type: String, required: true, unique: true },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      type: String,
      validate: {
        validator: (v) => /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(v),
        message: "Invalid URL format for avatar",
      },
    },
    password: {
      type: String,
      required: true,
    },
    refreshToken: String,
    role: {
      type: String,
      enum: ["user", "driver", "admin", "rider"],
      required: true,
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      userName: this.userName,
      fullName: this.fullName,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);

//! DRIVER Schema

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["License", "Registration", "Insurance"],
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    required: true,
  },
});

const rideHistorySchema = new Schema({
  rideId: { type: String, required: true },
  date: { type: Date, required: true },
  amountEarned: { type: Number, required: true },
  pickupLocation: { type: String, required: true },
  dropLocation: { type: String, required: true },
});

const driverSchema = new Schema(
  {
    role: {
      type: String,
      default: "driver",
      enum: ["driver"], // Restrict role to "driver" only
      required: true,
    },
    licenseNumber: {
      type: String,
      required: true,
      unique: true,
    },
    vehicleDetails: {
      vehicleType: {
        type: String,
        required: true,
        enum: ["Car", "Bike", "Auto"],
      },
      model: { type: String, required: true },
      registrationNumber: { type: String, required: true, unique: true },
      color: { type: String, required: true },
    },
    availabilityStatus: {
      type: Boolean,
      default: true,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    rideHistory: [rideHistorySchema],
    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      totalRatings: { type: Number, default: 0 },
      ratingSum: { type: Number, default: 0 },
    },
    capacity: {
      type: Number,
      default: 1,
      required: true,
      min: [1, "Capacity must be at least 1"],
    },
    document: documentSchema,
    location: {
      type: {
        type: String, // GeoJSON type must be 'Point'
        enum: ["Point"],
        // required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        // required: true,
      },
    },
    socketId: { type: String }, // Track active WebSocket connection
  },
  { timestamps: true }
);

driverSchema.index({ location: "2dsphere" });

export const Driver = User.discriminator("Driver", driverSchema);

//! Admin Schema
const adminSchema = new Schema(
  {
    permissions: [
      {
        type: String, // e.g., "manageUsers", "viewReports", etc.
      },
    ],
    managedRegions: [
      {
        type: String, // Specifies the regions the admin manages
      },
    ],
    loginHistory: [
      {
        ipAddress: String,
        date: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const Admin = User.discriminator("Admin", adminSchema);

/* //! RIDER Schema
const riderSchema = new Schema(
  {
    savedLocations: [
      {
        name: { type: String }, // e.g., "Home" or "Work"
        address: String,
        coordinates: {
          lat: { type: Number },
          lng: { type: Number },
        },
      },
    ],
    rideHistory: [
      {
        rideId: String,
        date: Date,
        amountPaid: Number,
        pickupLocation: String,
        dropLocation: String,
      },
    ],
    paymentMethods: [
      {
        type: { type: String }, // e.g., Card, Wallet, etc.
        details: Object, // E.g., last 4 digits of card number
      },
    ],
    promoCodes: [
      {
        code: String,
        discount: Number, // Percentage or flat discount
        expiration: Date,
      },
    ],
  },
  { timestamps: true }
);

export const Rider = User.discriminator("Rider", riderSchema); */

/* 
Shared Utility Functions
Since all roles extend the base schema, methods such as isPasswordCorrect, generateAccessToken, and generateRefreshToken are inherited and can be used directly with any role instance:

javascript
Copy
Edit
// Example Usage
const driver = new Driver({
  userName: "driver1",
  email: "driver@example.com",
  fullName: "John Driver",
  password: "securepassword",
  role: "driver",
  licenseNumber: "LIC123456789",
  vehicleDetails: {
    vehicleType: "Car",
    model: "Tesla Model 3",
    registrationNumber: "ABC123",
    color: "Red",
  },
});

await driver.save();

// Generating Access Token
const token = driver.generateAccessToken();
console.log("Access Token:", token);
 */
