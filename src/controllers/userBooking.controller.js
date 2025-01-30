import { Booking } from "../models/booking.model.js";
import { Driver, User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Client } from "@googlemaps/google-maps-services-js";
import { DRIVER_ASSIGNED, NEW_BOOKING } from "../constants.js";
import axios from "axios";

const client = new Client({});

// OSRM API endpoint (using public demo server)
const OSRM_BASE_URL = "http://router.project-osrm.org/route/v1/driving";

// ! => /book
const createBooking = (io) =>
  asyncHandler(async (req, res) => {
    const { pickupLocation, dropLocation, ridePreferences, paymentMethod } =
      req.body;

    console.log("Pickup location: " + pickupLocation);
    console.log("Drop location:" + dropLocation);

    // Get real distance & ETA from Google Maps
    const { distance, duration } = await getRouteDetails(
      pickupLocation,
      dropLocation
    );

    const fare = calculateFare(distance);

    // Check if user exists
    const user = await User.findById(req.user?._id);
    if (!user) {
      return res.status(404).json(new ApiResponse(404, {}, "User not found"));
      // throw new ApiError(404, "User not found");
    }

    const booking = await Booking.create({
      user: req.user._id,
      pickupLocation: {
        type: "Point", // GeoJSON format
        coordinates: [pickupLocation.longitude, pickupLocation.latitude],
        address: pickupLocation.address,
      },
      dropLocation: {
        type: "Point",
        coordinates: [dropLocation.longitude, dropLocation.latitude],
        address: dropLocation.address,
      },
      distance,
      fare,
      ridePreferences, // e.g., carType: "SUV", passengers: 4
      paymentMethod, // e.g., "Cash", "Card"
      status: "Pending",
      eta: duration,
    });

    if (!booking) {
      return res.status(500).json(new ApiResponse(500, {}, "Booking failed"));
    }

    await booking.populate(
      "user",
      "userName fullName email phoneNumber fullName"
    );

    // Find nearby drivers
    const drivers = await Driver.find({
      availabilityStatus: true,
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [
              booking.pickupLocation.coordinates[0],
              booking.pickupLocation.coordinates[1],
            ],
          },
          $maxDistance: 10000, // 10 km
        },
      },
    });

    // Notify nearby drivers
    drivers.forEach((driver) => {
      const driverSocketId = activeDrivers.get(driver._id.toString());
      if (driverSocketId) {
        io.to(driverSocketId).emit(NEW_BOOKING, booking);
      }
    });

    return res
      .status(201)
      .json(new ApiResponse(201, booking, "Booking Created Successfully"));
  });

const calculateFare = (distance) => {
  const baseFare = 20; // Fixed base fare
  const perKmRate = 5; // Cost per km
  return baseFare + distance * perKmRate;
};

//! Get NearBy Bookings   => /bookings/nearby

const getBookings = asyncHandler(async (req, res) => {
  const { latitude, longitude, radius } = req.body;

  const maxDistance = radius * 1000;

  const bookingsList = await Booking.find({
    status: "Pending",
    pickupLocation: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude], // GeoJSON format
        },
        $maxDistance: maxDistance,
      },
    },
  })
    .populate("user", "userName fullName") // Populate user details
    .populate("driver", "driverName vehicle"); // Populate driver details

  if (bookingsList.length === 0) {
    return res.status(404).json(new ApiResponse(404, {}, "No bookings found"));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, bookingsList, "Bookings fetched"));
});

//! Driver API: Accept Booking
//! Endpoint: /bookings/:id/accept

const acceptBooking = (io) =>
  asyncHandler(async (req, res) => {
    const { bookingId } = req.body;

    // Check if the user is a driver
    const driver = await Driver.findById(req.user?._id);
    if (!driver) {
      throw new ApiError(403, "Only drivers can accept bookings");
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res
        .status(404)
        .json(new ApiResponse(404, {}, "Booking not found"));
    }

    if (booking.status !== "Pending") {
      return res
        .status(400)
        .json(new ApiResponse(400, {}, "Booking is no longer available."));
    }

    booking.driver = driver?._id;
    booking.status = "Accepted";

    await booking.save({ validateBeforeSave: false });

    // Notify the user
    //! TODO Uncomment when doing socket
    /* const userSocketId = activeUsers.get(booking.user.toString());
    if (userSocketId) {
      io.to(userSocketId).emit(DRIVER_ASSIGNED, booking);
    } */

    return res
      .status(200)
      .json(new ApiResponse(200, booking, "Booking accepted"));
  });

const getNearByDriver = asyncHandler(async (request, res) => {
  const { latitude, longitude, radius } = request.body;

  const drivers = await Driver.find({
    availabilityStatus: true,
    location: {
      $near: {
        $geometry: {
          point: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: radius * 1000,
      },
    },
  });

  if (drivers.length === 0) {
    return res
      .status(404)
      .json(new ApiResponse(404, {}, "No drivers available in the area"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, drivers, "Nearby drivers found"));
});

const getRouteDetails = async (origin, destination) => {
  try {
    const start = `${origin.longitude},${origin.latitude}`;
    const end = `${destination.longitude},${destination.latitude}`;

    /*   console.log(
      "OSRM Request URL:",
      `${OSRM_BASE_URL}/${start};${end}?overview=false`
    ); */

    const response = await axios.get(
      `${OSRM_BASE_URL}/${start};${end}?overview=false`,
      { timeout: 10000 }
    );

    // console.log("OSRM Response Status:", response.status);
    console.log("OSRM Response Data:", response.data);

    if (response.data.code !== "Ok" || !response.data.routes?.[0]) {
      throw new ApiError(400, "No route found between these locations");
    }

    const distance = response.data.routes[0].distance / 1000; // Convert to km
    const duration = `${Math.round(response.data.routes[0].duration / 60)} mins`;

    console.log("Calculated Distance:", distance, "km");
    console.log("Calculated Duration:", duration);

    return { distance, duration };
  } catch (error) {
    console.error("Routing Error Details:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });
    throw new ApiError(500, `Routing failed: ${error.message}`);
  }
};
/* const getRouteDetails = async (origin, destination) => {
  try {
    const response = await client.directions({
      params: {
        origin: `${origin.latitude},${origin.longitude}`,
        destination: `${destination.latitude},${destination.longitude}`,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    const distance = response.data.routes[0].legs[0].distance.value / 1000; // in km
    const duration = response.data.routes[0].legs[0].duration.text; // ETA

    return { distance, duration };
  } catch (error) {
    throw new ApiError(500, "Failed to calculate route");
  }
}; */

export {
  createBooking,
  getBookings,
  acceptBooking,
  getNearByDriver,
  getRouteDetails,
};
