import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  createBooking,
  getBookings,
  acceptBooking,
} from "../controllers/userBooking.controller.js";

const router = Router();

const initializeBookingRoutes = (io) => {
  router.use(verifyJWT);

  router.route("/createBooking").post(createBooking(io));
  router.route("/getBookings").get(getBookings);
  router.route("/acceptBooking").post(acceptBooking(io));

  // router.route("/createBooking").post(verifyJWT, createBooking);
  // router.route("/getBookings").get(verifyJWT, getBookings);
  // router.route("/acceptBooking").post(verifyJWT, acceptBooking);

  return router;
};

export { initializeBookingRoutes };
