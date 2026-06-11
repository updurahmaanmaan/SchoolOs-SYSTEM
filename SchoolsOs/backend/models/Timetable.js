const mongoose = require('mongoose');

const SlotSchema = new mongoose.Schema({}, {_id:false});

const TimetableSchema = new mongoose.Schema({
  owner: {type: mongoose.Schema.Types.ObjectId, ref:'User'},
  weekend: [String],
  periods: [{ id: Number, label: String, start: String, end: String, type: String }],
  slots: {}, // flexible object map like {"ClassA|Mon|12345":"Math"}
  createdAt: {type:Date, default:Date.now}
});

module.exports = mongoose.model('Timetable', TimetableSchema);
