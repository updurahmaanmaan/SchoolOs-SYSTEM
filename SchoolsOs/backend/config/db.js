const mongoose = require('mongoose');

async function connect(uri){
  if(!uri) throw new Error('MONGO_URI not provided');
  await mongoose.connect(uri, {useNewUrlParser:true,useUnifiedTopology:true});
  console.log('MongoDB connected');
}

module.exports = { connect };
