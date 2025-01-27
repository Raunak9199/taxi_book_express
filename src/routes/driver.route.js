import { Router } from "express";

import {
  updateDriverLicense,
  updateDriverDetail,
} from "../controllers/driver.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/updateDriverDetail").patch(
  verifyJWT,
  upload.fields([
    {
      name: "vehicleDocDetail",
      maxCount: 1,
    },
  ]),
  updateDriverLicense
);

router
  .route("/updateDocument")
  .patch(
    verifyJWT,
    upload.single({ name: "vehicleDocDetail", maxCount: 1 }),
    updateDriverDetail
  );
export default router;
