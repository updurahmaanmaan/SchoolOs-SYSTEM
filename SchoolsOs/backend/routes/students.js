const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req,res)=>{
  const students = await Student.find({createdBy:req.user._id}).sort({createdAt:-1});
  res.json(students);
});

router.post('/', async (req,res)=>{
  try{
    const s = req.body; s.createdBy = req.user._id;
    const st = await Student.create(s);
    res.json(st);
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

router.put('/:id', async (req,res)=>{
  try{
    const st = await Student.findOneAndUpdate({_id:req.params.id,createdBy:req.user._id}, req.body, {new:true});
    if(!st) return res.status(404).json({message:'Not found'});
    res.json(st);
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

router.delete('/:id', async (req,res)=>{
  try{
    const st = await Student.findOneAndDelete({_id:req.params.id,createdBy:req.user._id});
    if(!st) return res.status(404).json({message:'Not found'});
    res.json({message:'Deleted'});
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

module.exports = router;
