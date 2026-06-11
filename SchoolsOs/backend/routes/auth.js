const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/register', async (req,res)=>{
  try{
    const {name,email,password,schoolName} = req.body;
    if(!email||!password||!name) return res.status(400).json({message:'Missing fields'});
    const exists = await User.findOne({email}); if(exists) return res.status(400).json({message:'Email exists'});
    const user = new User({name,email,password,schoolName}); await user.save();
    const token = jwt.sign({id:user._id}, process.env.JWT_SECRET||'secret',{expiresIn:'7d'});
    res.json({user:{id:user._id,name:user.name,email:user.email,schoolName:user.schoolName},token});
  }catch(e){console.error(e);res.status(500).json({message:'Server error'});} 
});

router.post('/login', async (req,res)=>{
  try{
    const {email,password} = req.body; if(!email||!password) return res.status(400).json({message:'Missing fields'});
    const user = await User.findOne({email}); if(!user) return res.status(400).json({message:'Invalid credentials'});
    const ok = await user.comparePassword(password); if(!ok) return res.status(400).json({message:'Invalid credentials'});
    const token = jwt.sign({id:user._id}, process.env.JWT_SECRET||'secret',{expiresIn:'7d'});
    res.json({user:{id:user._id,name:user.name,email:user.email,schoolName:user.schoolName},token});
  }catch(e){console.error(e);res.status(500).json({message:'Server error'});} 
});

module.exports = router;
