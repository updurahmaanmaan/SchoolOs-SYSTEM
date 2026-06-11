const mongoose = require('mongoose');

const ClassFormSchema = new mongoose.Schema({
  formName: {type:String, required:true, unique:true},
  classes: [String],
  createdBy: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  createdAt: {type:Date, default:Date.now}
});

module.exports = mongoose.model('ClassForm', ClassFormSchema);
