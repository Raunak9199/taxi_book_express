import { ApiResponse } from "../utils/ApiResponse.js";
import { User, Driver } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const updateDriverLicense = asyncHandler(async (req, res) => {
  /* console.log("Request File:", req.file); // For `upload.single`
  console.log("Request Files:", req.files); // For `upload.array` */
  const {
    licenseNumber,
    vehicleType,
    model,
    registrationNumber,
    color,
    type,
    isVerified,
    // fileUrl,
  } = req.body;

  console.log("License:", licenseNumber);
  console.log("vehicleType:", vehicleType);
  console.log("model:", model);
  console.log("registrationNumber:", registrationNumber);
  console.log("color:", color);
  console.log("documentType:", type);
  console.log("isVerified:", isVerified);

  // console.log("fileUrl:", fileUrl);

  // Validate required fields
  /*  if (!licenseNumber) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "License number is required"));
  }

  if (!vehicleType) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Vehicle type is required"));
  }

  if (!model) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Vehicle model is required"));
  }

  if (!registrationNumber) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, {}, "Vehicle registration number is required")
      );
  }

  if (!color) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Vehicle color is required"));
  } */

  if (type && !["License", "Insurance", "Registration"].includes(type)) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Invalid document type"));
  }

  // If fileUrl is provided, validate it
  let validatedDocument = null;
  const fileUrl = req.files?.vehicleDocDetail[0]?.path;

  console.log("file", fileUrl);
  if (fileUrl) {
    // if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/.test(fileUrl)) {
    //   return res
    //     .status(400)
    //     .json(new ApiResponse(400, {}, "Invalid or missing document fileUrl"));
    // }

    // Handle document upload to Cloudinary
    const uploadedDoc = await uploadOnCloudinary(fileUrl);

    if (!uploadedDoc || !uploadedDoc.url) {
      return res
        .status(400)
        .json(new ApiResponse(400, {}, `Failed to upload document: ${type}`));
    }

    validatedDocument = {
      type,
      fileUrl: uploadedDoc.url,
      isVerified: isVerified !== undefined ? isVerified : false,
    };
    // console.log("Update document1", validatedDocument);
  } else {
    validatedDocument = {
      type,
      fileUrl: null,
      isVerified: isVerified !== undefined ? isVerified : false,
    };
  }

  // Find driver and update details
  const driver = await Driver.findById(req.user?._id);

  // console.log("Driver:", driver);
  // console.log("Driver1:", req.user);

  if (!driver) {
    return res.status(404).json(new ApiResponse(404, {}, "Driver not found"));
  }

  // Update the driver's license and vehicle details
  driver.licenseNumber = licenseNumber;
  driver.vehicleDetails = {
    vehicleType,
    model,
    registrationNumber,
    color,
  };

  // Update the document if provided
  // console.log("Update document", validatedDocument);
  if (validatedDocument) {
    driver.document = validatedDocument; // Ensure it's an array, even with a single document
    console.log("doc:", driver.document);
  } else {
    driver.document = {
      type,
    };
  }

  // Save the updated driver information
  await driver.save({ validateBeforeSave: false });

  // console.log("Driver after update", driver);

  return res
    .status(200)
    .json(new ApiResponse(200, driver, "Driver details updated successfully"));
});

//! UPDATE DOC

const updateDriverDetail = asyncHandler(async (req, res) => {
  const documentLocalPath = req.file?.path;

  if (!documentLocalPath) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Document file is required"));
  }

  // Upload the document to Cloudinary
  const uploadedDocument = await uploadOnCloudinary(documentLocalPath);

  if (!uploadedDocument.url) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Document upload failed"));
  }

  const driver = await Driver.findById(req.user?._id);
  if (!driver) {
    return res.status(404).json(new ApiResponse(404, {}, "Driver not found"));
  }

  const { docType } = req.body; // Document type like 'License', 'Insurance'

  if (!docType) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Document type is required"));
  }

  // Ensure the `document` object exists
  driver.document = driver.document || {};

  // Update the document object
  driver.document = {
    type: docType,
    fileUrl: uploadedDocument.url,
    isVerified: false,
  };

  // Save the updated driver
  await driver.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, driver, "Driver document updated successfully"));
});

export { updateDriverLicense, updateDriverDetail };
