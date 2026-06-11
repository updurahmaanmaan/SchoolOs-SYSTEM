const express = require('express');
const router = express.Router();
const Timetable = require('../models/Timetable');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req,res)=>{
  let tt = await Timetable.findOne({owner:req.user._id});
  if(!tt){ tt = await Timetable.create({owner:req.user._id, weekend:[], periods:[], slots:{}}); }
  res.json(tt);
});

router.put('/', async (req,res)=>{
  try{
    const body = req.body; const tt = await Timetable.findOneAndUpdate({owner:req.user._id}, body, {new:true, upsert:true});
    res.json(tt);
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

module.exports = router;
