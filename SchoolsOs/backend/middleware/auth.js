const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function(req,res,next){
  const h = req.headers.authorization;
  if(!h||!h.startsWith('Bearer ')) return res.status(401).json({message:'No token'});
  const token = h.split(' ')[1];
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(payload.id).select('-password');
    if(!user) return res.status(401).json({message:'Invalid token'});
    req.user = user; next();
  }catch(e){return res.status(401).json({message:'Invalid token'});} 
};
