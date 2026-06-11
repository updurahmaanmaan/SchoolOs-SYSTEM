require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connect } = require('./config/db');

const app = express();
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/timetable', require('./routes/timetable'));
app.use('/api/attendance', require('./routes/attendance'));

const PORT = process.env.PORT || 4000;

async function start(){
  try{
    await connect(process.env.MONGO_URI);
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    app.set('io', io);
    io.on('connection', socket => {
      console.log('Socket connected:', socket.id);
      socket.on('disconnect', ()=>console.log('Socket disconnected:', socket.id));
    });

    server.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT}`));
  }catch(e){console.error('Failed to start',e);process.exit(1);} 
}
start();
