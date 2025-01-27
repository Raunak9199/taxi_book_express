import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { ApiError } from "./ApiError.js";

// Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;

    // Upload on Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
      folder: "taxi_app",
    });
    // Uploaded on Cloudinary
    console.log("File uploaded on Cloudinary", response.url);
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath);
    return null;
  }
};

// Delete image from Cloudinary
// Delete image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      throw new ApiError(400, "Public ID is required to delete the file");
    }

    // Add folder to public_id if not already included
    const fullPublicId = publicId.startsWith("taxi_app/")
      ? publicId
      : `taxi_app/${publicId}`;

    const result = await cloudinary.uploader.destroy(fullPublicId);

    if (result.result === "not found") {
      throw new ApiError(404, `File with ID ${fullPublicId} not found`);
    }

    console.log("File deleted from Cloudinary:", result);
    return result;
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
    throw new ApiError(500, error?.message || "Failed to delete file");
  }
};
/* const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log("File deleted from Cloudinary:", result);

    return result;
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
    // throw new ApiError(
    //   400,
    //   error?.message || "Error deleting file from Cloudinary"
    // );
    return null;
  }
}; */

export { uploadOnCloudinary, deleteFromCloudinary };
