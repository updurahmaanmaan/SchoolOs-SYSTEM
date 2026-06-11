const express = require('express');
const router = express.Router();
const ClassForm = require('../models/ClassForm');
const auth = require('../middleware/auth');

router.use(auth);

// Get all forms
router.get('/', async (req,res)=>{
  const forms = await ClassForm.find({createdBy:req.user._id});
  res.json(forms);
});

// Create form
router.post('/', async (req,res)=>{
  try{
    const {formName, classes} = req.body;
    if(!formName) return res.status(400).json({message:'Missing formName'});
    const cf = new ClassForm({formName,classes:classes||[], createdBy:req.user._id});
    await cf.save(); res.json(cf);
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

// Update form
router.put('/:id', async (req,res)=>{
  try{
    const cf = await ClassForm.findOneAndUpdate({_id:req.params.id,createdBy:req.user._id}, req.body, {new:true});
    if(!cf) return res.status(404).json({message:'Not found'});
    res.json(cf);
  }catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

// Delete form
router.delete('/:id', async (req,res)=>{
  try{await ClassForm.findOneAndDelete({_id:req.params.id,createdBy:req.user._id});res.json({message:'Deleted'});}catch(e){console.error(e);res.status(400).json({message:'Bad request'});} 
});

module.exports = router;
