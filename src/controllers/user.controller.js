import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User, Driver, Admin } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const registerUser = asyncHandler(async (req, res) => {
  // Extract driver-specific fields from request body
  const {
    fullName,
    email,
    phoneNumber,
    userName,
    role,
    password,
    licenceNumber, // Corrected to match the request body
    vehicleType,
    model,
    registrationNumber,
    color,
    type, // Document type (e.g. "License")
    isVerified, // Whether the document is verified
  } = req.body;

  console.log("role: ", role);

  // Validate common fields
  const commonFields = [fullName, email, phoneNumber, userName, role, password];
  if (commonFields.some((field) => field?.trim() === "")) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "All fields are required"));
  }

  // Validate driver-specific fields if role is driver
  if (role === "driver") {
    const driverFields = [
      licenceNumber,
      vehicleType,
      model,
      registrationNumber,
      color,
    ];
    if (driverFields.some((field) => !field?.trim())) {
      return res
        .status(400)
        .json(
          new ApiResponse(
            400,
            {},
            "Driver requires: licenceNumber, vehicleType, model, registrationNumber, color"
          )
        );
    }
  }

  // Check for existing user (same email or userName)
  const existingUser = await User.findOne({ $or: [{ email }, { userName }] });
  if (existingUser) {
    return res
      .status(409)
      .json(new ApiResponse(409, {}, "User already exists"));
  }

  // Handle avatar upload
  const avatarLocalPath = req.files?.avatar[0]?.path;
  const vehicleDocPath = req.files?.vehicleDocDetail[0]?.path;
  if (!avatarLocalPath) {
    return res.status(400).json(new ApiResponse(400, {}, "Avatar is required"));
  }
  if (role === "driver" && !vehicleDocPath) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Detail proof is required"));
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar?.url) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Avatar upload failed"));
  }

  const vehicleDoc = await uploadOnCloudinary(vehicleDocPath);
  if (role === "driver" && !vehicleDoc?.url) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Vehicle document upload failed"));
  }

  // Create user based on role
  let user;
  try {
    switch (role) {
      case "driver":
        user = await Driver.create({
          fullName,
          email,
          phoneNumber,
          userName: userName.toLowerCase(),
          password,
          role,
          avatar: avatar.url,
          licenseNumber: licenceNumber, // Use validated field
          vehicleDetails: {
            vehicleType,
            model,
            registrationNumber,
            color,
          },
          document: {
            type, // e.g., "License"
            fileUrl: vehicleDoc.url,
            isVerified: isVerified === "true", // Convert to boolean
          },
        });
        break;

      case "admin":
        user = await Admin.create({
          fullName,
          email,
          phoneNumber,
          userName: userName.toLowerCase(),
          password,
          role,
          avatar: avatar.url,
        });
        break;

      default:
        user = await User.create({
          fullName,
          email,
          phoneNumber,
          userName: userName.toLowerCase(),
          password,
          role,
          avatar: avatar.url,
        });
    }
  } catch (error) {
    // Handle unique constraint errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res
        .status(400)
        .json(new ApiResponse(400, {}, `${field} already exists`));
    }
    throw error;
  }

  // Return created user without sensitive data
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, userName, password } = req.body;

  if (!(userName || email)) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Username or email is required"));
  }

  const user = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isPassworValid = await user.isPasswordCorrect(password);

  if (!isPassworValid) {
    throw new ApiError(401, "Invalid password.");
  }
  const token = await generateAccessAndRefreshTokens(user._id);

  // access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // send cookies
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully."
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: 1 }, // this removes the field from document ( 1 is used to unset a value in mongo DB),
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully."));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);

  if (!user) {
    return res.status(404).json(new ApiResponse(404, {}, "User not found"));
  }

  const isPasswordMatch = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordMatch) {
    return res
      .status(401)
      .json(new ApiResponse(401, {}, "Old password is incorrect"));
  }

  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email, userName } = req.body;

  if (!(fullName || email || userName)) {
    return res
      .status(400)
      .json(
        new ApiResponse(400, {}, "Please provide at least one field to update")
      );
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName: fullName,
        email: email,
        userName: userName,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is missing.");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Avatar upload failed.");
  }

  const user = await User.findById(req.user?._id);

  // Delete old avatar if exists
  if (user.avatar) {
    const oldAvatarPublicId = user.avatar.split("/").pop().split(".")[0];
    await deleteFromCloudinary(oldAvatarPublicId);
  }

  // Update the user with the new avatar
  user.avatar = avatar.url;
  await user.save((validateBeforeSave = false));
  /*  const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set: {
          avatar: avatar.url,
        },
      },
      {
        new: true,
      }
    ).select("-password"); */

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User Avatar Updated Successfully."));
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password");
  if (!users) {
    throw res.status(500).json(ApiResponse(200, {}, "Failed to fetch users"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users retrieved successfully"));
});

const getUserbyRole = asyncHandler(async (req, res) => {
  const role = req.params;

  if (role === "") {
    return res.status(400).json(ApiResponse(400, {}, "Role is required"));
  }
  const users = await User.find({ role });

  if (!users) {
    return res
      .status(404)
      .json(ApiResponse(404, {}, "No users found with the provided role"));
  }
  return res
    .status(200)
    .json(new ApiResponse(200, users, `${role}s fetched successfully`));
});

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    console.log("user:", user);
    console.log("acces:", accessToken);
    console.log("refr:", refreshToken);

    /* user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false }); */
    await User.findByIdAndUpdate(userId, { refreshToken });

    console.log("refr after:", user.refreshToken);
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token." +
        error.message
    );
  }
};

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized Request.");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken._id);
    if (!user) {
      throw new ApiError(401, "Invalid Refresh TOken.");
    }

    if (incomingRefreshToken != user?.refreshToken) {
      throw new ApiError(401, "Refresh Token is Expired or Used.");
    }
    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access Token refreshed successfully."
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  getAllUsers,
  getUserbyRole,
};

// const registerUser = asyncHandler(async (req, res) => {
//   const { fullName, email, userName, role, password } = req.body;
//   console.log("role: ", role);

//   if (
//     [fullName, email, userName, role, password].some(
//       (field) => field?.trim() === ""
//     )
//   ) {
//     return res
//       .status(400)
//       .json(new ApiResponse(400, {}, "All fields are required"));
//   }

//   const existingUser = await User.findOne({
//     $or: [{ email }, { userName }],
//   });

//   if (existingUser) {
//     return res
//       .status(409)
//       .json(new ApiResponse(409, {}, "User already exists"));
//     // throw new ApiError(409, "User already exists");
//   }

//   const avatarLocalPath = req.files?.avatar[0]?.path;

//   console.log("avatarLocalPath:", avatarLocalPath);

//   if (!avatarLocalPath) {
//     return res.status(400).json(new ApiResponse(400, {}, "Avatar is required"));
//   }

//   const avatar = await uploadOnCloudinary(avatarLocalPath);

//   if (!avatar) {
//     return res
//       .status(400)
//       .json(new ApiResponse(400, {}, "Avatar file is required"));
//   }

//   // DB Entry
//   // Role-based document creation
//   let user;
//   if (role === "driver") {
//     // Create driver with required fields (initialize empty values)
//     user = await Driver.create({
//       fullName,
//       email,
//       userName: userName.toLowerCase(),
//       password,
//       role,
//       avatar: avatar.url,
//       licenseNumber: "T",
//       vehicleDetails: {
//         vehicleType: "",
//         model: "",
//         registrationNumber: "",
//         color: "",
//       },
//     });
//   } else if (role === "admin") {
//     // Create driver with required fields (initialize empty values)
//     user = await Admin.create({
//       fullName,
//       email,
//       userName: userName.toLowerCase(),
//       password,
//       role,
//       avatar: avatar.url,
//       // licenseNumber: "TEMP_LICENSE", // Placeholder (update later)
//       // vehicleDetails: {
//       //   vehicleType: "TEMP_TYPE",
//       //   model: "TEMP_MODEL",
//       //   registrationNumber: "TEMP_REG",
//       //   color: "TEMP_COLOR",
//       // },
//     });
//   } else {
//     // Create regular user
//     user = await User.create({
//       fullName,
//       email,
//       userName: userName.toLowerCase(),
//       password,
//       role,
//       avatar: avatar.url,
//     });
//   }
//   /* const user = await User.create({
//     fullName: fullName,
//     avatar: avatar?.url,
//     email: email,
//     password: password,
//     role: role,
//     userName: userName.toLowerCase(),
//   }); */

//   const createdUser = await User.findById(user._id).select(
//     "-password -refreshToken"
//   );

//   if (!createdUser) {
//     throw new ApiError(500, "Something went wrong while registering user.");
//   }
//   return res
//     .status(201)
//     .json(new ApiResponse(201, createdUser, "Successfully Registered"));
// });
