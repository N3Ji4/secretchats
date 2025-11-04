const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active rooms
const rooms = new Map();
const userSockets = new Map();

// API Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/create-room', (req, res) => {
  const { roomName, initialMessage } = req.body;
  const roomId = uuidv4();
  
  const room = {
    id: roomId,
    name: roomName || 'Chat Rahasia',
    host: null,
    participants: new Set(),
    messages: [],
    createdAt: new Date(),
    initialMessage: initialMessage || ''
  };
  
  rooms.set(roomId, room);
  
  res.json({
    success: true,
    roomId: roomId,
    roomUrl: `${req.protocol}://${req.get('host')}?room=${roomId}`,
    message: 'Room created successfully'
  });
});

app.get('/api/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({
      success: false,
      message: 'Room not found'
    });
  }
  
  res.json({
    success: true,
    room: {
      id: room.id,
      name: room.name,
      participantCount: room.participants.size,
      createdAt: room.createdAt
    }
  });
});

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, username = 'Anonymous' } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Join the room
    socket.join(roomId);
    room.participants.add(socket.id);
    userSockets.set(socket.id, { roomId, username });

    // Set host if first participant
    if (!room.host) {
      room.host = socket.id;
    }

    // Notify others about new participant
    socket.to(roomId).emit('user-joined', {
      username: username,
      participantCount: room.participants.size,
      message: `${username} joined the chat`
    });

    // Send room info to the user
    socket.emit('room-joined', {
      roomId: roomId,
      roomName: room.name,
      participantCount: room.participants.size,
      isHost: room.host === socket.id,
      messages: room.messages.slice(-50) // Last 50 messages
    });

    // Send initial message if host and has initial message
    if (room.host === socket.id && room.initialMessage) {
      setTimeout(() => {
        const message = {
          id: uuidv4(),
          text: room.initialMessage,
          username: 'Host',
          timestamp: new Date(),
          type: 'text'
        };
        
        room.messages.push(message);
        io.to(roomId).emit('new-message', message);
      }, 1000);
    }

    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('send-message', (data) => {
    const { roomId, message, messageId, type = 'text' } = data;
    const room = rooms.get(roomId);
    const userData = userSockets.get(socket.id);
    
    if (!room || !userData) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const messageObj = {
      id: messageId || uuidv4(),
      text: message,
      username: userData.username,
      userId: socket.id,
      timestamp: new Date(),
      type: type,
      status: 'sent'
    };

    // Add to room messages
    room.messages.push(messageObj);

    // Broadcast to all in room
    io.to(roomId).emit('new-message', messageObj);

    // Update message status to delivered
    setTimeout(() => {
      messageObj.status = 'delivered';
      io.to(roomId).emit('message-status-update', {
        messageId: messageObj.id,
        status: 'delivered'
      });
    }, 500);

    // Simulate read receipts
    setTimeout(() => {
      messageObj.status = 'read';
      io.to(roomId).emit('message-status-update', {
        messageId: messageObj.id,
        status: 'read'
      });
    }, 2000);
  });

  socket.on('typing-start', (data) => {
    const { roomId } = data;
    const userData = userSockets.get(socket.id);
    
    if (userData) {
      socket.to(roomId).emit('user-typing', {
        username: userData.username,
        typing: true
      });
    }
  });

  socket.on('typing-stop', (data) => {
    const { roomId } = data;
    const userData = userSockets.get(socket.id);
    
    if (userData) {
      socket.to(roomId).emit('user-typing', {
        username: userData.username,
        typing: false
      });
    }
  });

  socket.on('disconnect', () => {
    const userData = userSockets.get(socket.id);
    
    if (userData) {
      const room = rooms.get(userData.roomId);
      
      if (room) {
        room.participants.delete(socket.id);
        
        // Notify others
        socket.to(userData.roomId).emit('user-left', {
          username: userData.username,
          participantCount: room.participants.size,
          message: `${userData.username} left the chat`
        });

        // Clean up empty rooms after 5 minutes
        if (room.participants.size === 0) {
          setTimeout(() => {
            if (rooms.get(userData.roomId)?.participants.size === 0) {
              rooms.delete(userData.roomId);
              console.log(`Room ${userData.roomId} deleted due to inactivity`);
            }
          }, 5 * 60 * 1000);
        }
      }
    }

    userSockets.delete(socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});