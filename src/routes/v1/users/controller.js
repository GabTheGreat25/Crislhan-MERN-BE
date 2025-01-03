const asyncHandler = require("express-async-handler");
const createError = require("http-errors");
const bcrypt = require("bcrypt");
const service = require("./service.js");
const { RESOURCE, STATUSCODE } = require("../../../constants/index.js");
const { ENV } = require("../../../config/environment.js");
const { upload } = require("../../../utils/multer.js");
const { responseHandler } = require("../../../utils/responseHandler.js");
const { multipleImages } = require("../../../utils/multipleImages.js");
const { sendEmail } = require("../../../utils/passMailer.js");
const { generateRandomCode } = require("../../../utils/randomCode.js");
const {
  setToken,
  getToken,
  blacklistToken,
  isTokenBlacklisted,
} = require("../../../middlewares/blacklist.js");
const { generateAccess } = require("../../../middlewares/generateAccess.js");

const getAllUsers = asyncHandler(async (req, res) => {
  const data = await service.getAll();

  responseHandler(
    res,
    data,
    data?.length === STATUSCODE.ZERO
      ? "No Users found"
      : "All Users retrieved successfully",
  );
});

const getAllUsersDeleted = asyncHandler(async (req, res) => {
  const data = await service.getAllDeleted();

  responseHandler(
    res,
    data,
    data?.length === STATUSCODE.ZERO
      ? "No Deleted Users found"
      : "All Deleted Users retrieved successfully",
  );
});

const getSingleUser = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);

  responseHandler(
    res,
    data,
    !data ? "No User found" : "User retrieved successfully",
  );
});

const loginUser = asyncHandler(async (req, res) => {
  const data = await service.getEmail(req.body.email);

  if (!data) throw createError(STATUSCODE.NOT_FOUND, "No User found");

  if (!(await bcrypt.compare(req.body.password, data.password)))
    throw createError(STATUSCODE.UNAUTHORIZED, "Password does not match");

  const accessToken = generateAccess({
    id: data._id,
    role: data[RESOURCE.ROLE],
  });
  setToken(accessToken.access);

  responseHandler(res, data, "User Login successfully", accessToken);
});

const logoutUser = asyncHandler(async (req, res, next) => {
  const savedToken = getToken();

  !savedToken || isTokenBlacklisted()
    ? next(createError(STATUSCODE.UNAUTHORIZED, "You are not logged in"))
    : (blacklistToken(), responseHandler(res, [], "User Logout successfully"));
});

const createNewUser = [
  upload.array("image"),
  asyncHandler(async (req, res) => {
    const uploadedImages = await multipleImages(req.files, []);
    const hashed = await bcrypt.hash(req.body.password, ENV.SALT_NUMBER);

    if (uploadedImages.length === STATUSCODE.ZERO)
      throw createError(STATUSCODE.BAD_REQUEST, "Image is required");

    const data = await service.add(
      {
        ...req.body,
        password: hashed,
        image: uploadedImages,
      },
      req.session,
    );

    responseHandler(res, [data], "User created successfully");
  }),
];

const updateUser = [
  upload.array("image"),
  asyncHandler(async (req, res) => {
    const oldData = await service.getById(req.params.id);

    const uploadedImages =
      req.files.length > 0
        ? await multipleImages(
            req.files,
            oldData?.image.map((image) => image.public_id) || [],
          )
        : oldData.image;

    const data = await service.update(
      req.params.id,
      {
        ...req.body,
        image: uploadedImages,
      },
      req.session,
    );

    responseHandler(res, [data], "User updated successfully");
  }),
];

const deleteUser = asyncHandler(async (req, res) => {
  const data = await service.deleteById(req.params.id, req.session);

  responseHandler(
    res,
    data?.deleted ? [] : [data],
    data?.deleted ? "User is already deleted" : "User deleted successfully",
  );
});

const restoreUser = asyncHandler(async (req, res) => {
  const data = await service.restoreById(req.params.id, req.session);

  responseHandler(
    res,
    !data?.deleted ? [] : [data],
    !data?.deleted ? "User is not deleted" : "User restored successfully",
  );
});

const forceDeleteUser = asyncHandler(async (req, res) => {
  const data = await service.forceDelete(req.params.id, req.session);

  const message = !data ? "No User found" : "User force deleted successfully";

  await multipleImages(
    [],
    data?.image ? data.image.map((image) => image.public_id) : [],
  );

  responseHandler(res, [data], message);
});

const changeUserPassword = asyncHandler(async (req, res) => {
  if (!req.body.newPassword || !req.body.confirmPassword)
    throw createError(STATUSCODE.BAD_REQUEST, "Both passwords are required");

  if (req.body.newPassword !== req.body.confirmPassword)
    throw createError(STATUSCODE.BAD_REQUEST, "Passwords do not match");

  const data = await service.changePassword(
    req.params.id,
    req.body.newPassword,
    req.session,
  );

  responseHandler(res, [data], "Password changed successfully");
});

const sendUserEmailOTP = asyncHandler(async (req, res) => {
  const email = await service.getEmail(req.body.email);

  if (new Date() - new Date(email.verificationCode.createdAt) < 5 * 60 * 1000) {
    throw createError(
      "Please wait 5 minutes before requesting a new verification code",
    );
  }

  const code = generateRandomCode();
  await sendEmail(req.body.email, code);

  const data = await service.sendEmailOTP(req.body.email, code, req.session);

  responseHandler(res, [data], "Email OTP sent successfully");
});

const resetUserEmailPassword = asyncHandler(async (req, res) => {
  if (
    !req.body.newPassword ||
    !req.body.confirmPassword ||
    req.body.newPassword !== req.body.confirmPassword
  )
    throw createError(
      STATUSCODE.BAD_REQUEST,
      "Passwords are required and must match",
    );

  const code = await service.getCode(req.body.verificationCode);

  if (
    Date.now() - new Date(code.verificationCode.createdAt).getTime() >
    5 * 60 * 1000
  ) {
    code.verificationCode = null;
    await code.save();
    throw createError("Verification code has expired");
  }

  const data = await service.resetPassword(
    req.body.verificationCode,
    req.body.newPassword,
    req.session,
  );

  if (!data)
    throw createError(STATUSCODE.BAD_REQUEST, "Invalid verification code");

  responseHandler(res, [data], "Password Successfully Reset");
});

module.exports = {
  getAllUsers,
  getAllUsersDeleted,
  getSingleUser,
  createNewUser,
  updateUser,
  deleteUser,
  restoreUser,
  forceDeleteUser,
  loginUser,
  logoutUser,
  changeUserPassword,
  sendUserEmailOTP,
  resetUserEmailPassword,
};
