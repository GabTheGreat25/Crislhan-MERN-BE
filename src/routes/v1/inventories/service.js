const model = require("./model.js");

async function getAll() {
  return await model.find({ deleted: false });
}

async function getAllDeleted() {
  return await model.find({ deleted: true });
}

async function getById(_id) {
  return await model.findOne({ _id, deleted: false });
}

async function add(body, session) {
  return await model.create([body], { session });
}

async function update(_id, body, session) {
  return await model.findByIdAndUpdate(_id, body, {
    new: true,
    runValidators: true,
    session,
  });
}

async function deleteById(_id, session) {
  return await model.findByIdAndUpdate(_id, { deleted: true }, { session });
}

async function restoreById(_id, session) {
  return await model.findByIdAndUpdate(_id, { deleted: false }, { session });
}

async function forceDelete(_id, session) {
  return await model.findByIdAndDelete(_id, { session });
}

module.exports = {
  getAll,
  getAllDeleted,
  getById,
  add,
  update,
  deleteById,
  restoreById,
  forceDelete,
};
