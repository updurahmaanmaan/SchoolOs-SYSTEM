const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const auth = require('../middleware/auth');

// Helper to normalize date to midnight UTC
function dayStart(d){
  const dt = new Date(d);
  dt.setHours(0,0,0,0);
  return dt;
}

// Get attendance records for a student for a given month/year
// Query: studentId, month (1-12), year
router.get('/', auth, async (req,res)=>{
  try{
    const { studentId, month, year } = req.query;
    if(!studentId) return res.status(400).json({message:'studentId required'});
    const m = parseInt(month||new Date().getMonth()+1,10);
    const y = parseInt(year||new Date().getFullYear(),10);
    const start = new Date(y,m-1,1); start.setHours(0,0,0,0);
    const end = new Date(y,m,1); end.setHours(0,0,0,0);
    const list = await Attendance.find({ student: studentId, date: { $gte: start, $lt: end } }).lean();
    const present = list.filter(r=>r.status==='present').length;
    const percent = list.length?Math.round((present/list.length)*100):0;
    return res.json({records:list, percent});
  }catch(e){console.error(e);return res.status(500).json({message:'Server error'});} 
});

// Create or update attendance for a student on a date
// Body: studentId, date (ISO string), status
router.post('/', auth, async (req,res)=>{
  try{
    const { studentId, date, status } = req.body;
    if(!studentId||!date) return res.status(400).json({message:'studentId and date required'});
    const d = dayStart(date);
    const payload = { student: studentId, date: d, status: status||'absent', createdBy: req.user._id };
    const rec = await Attendance.findOneAndUpdate({ student: studentId, date: d }, payload, { upsert:true, new:true, setDefaultsOnInsert:true });
    // recompute overall percent for that month
    const m = d.getMonth(); const y = d.getFullYear();
    const start = new Date(y,m,1); start.setHours(0,0,0,0);
    const end = new Date(y,m+1,1); end.setHours(0,0,0,0);
    const list = await Attendance.find({ student: studentId, date: { $gte: start, $lt: end } });
    const present = list.filter(r=>r.status==='present').length;
    const percent = list.length?Math.round((present/list.length)*100):0;
    // update student summary
    await Student.findByIdAndUpdate(studentId,{ attendance: percent });
    // emit socket event
    try{ const io = req.app.get('io'); if(io) io.emit('attendance:updated',{ studentId, date: d, status: rec.status, percent }); }catch(e){console.warn('emit failed',e);} 
    return res.json({record:rec, percent});
  }catch(e){console.error(e);return res.status(500).json({message:'Server error'});} 
});

module.exports = router;
