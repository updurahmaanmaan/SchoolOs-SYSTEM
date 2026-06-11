const mongoose = require('mongoose');

const ExamSchema = new mongoose.Schema({
  subject: String,
  score: Number
}, {_id:false});

const StudentSchema = new mongoose.Schema({
  name: {type:String, required:true},
  initials: String,
  class: String,
  attendance: {type:Number, default:0},
  avgGrade: {type:Number, default:0},
  status: {type:String, enum:['active','at-risk','low-attendance'], default:'active'},
  color: String,
  exams: [ExamSchema],
  createdBy: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  createdAt: {type:Date, default:Date.now}
});

module.exports = mongoose.model('Student', StudentSchema);
