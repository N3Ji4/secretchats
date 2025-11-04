// Since Vercel doesn't support WebSocket in Serverless Functions,
// we'll use Server-Sent Events (SSE) as alternative

const connections = new Map();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // SSE connection
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    const roomId = req.query.roomId;
    const userId = req.query.userId || `user_${Date.now()}`;
    
    if (!roomId) {
      res.end();
      return;
    }
    
    // Store connection
    if (!connections.has(roomId)) {
      connections.set(roomId, new Map());
    }
    connections.get(roomId).set(userId, res);
    
    // Send welcome message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      userId: userId,
      message: 'Connected to room'
    })}\n\n`);
    
    // Handle client disconnect
    req.on('close', () => {
      if (connections.has(roomId)) {
        connections.get(roomId).delete(userId);
        
        // Notify others
        broadcastToRoom(roomId, {
          type: 'user-left',
          userId: userId,
          message: 'User left the chat'
        });
        
        // Clean empty rooms
        if (connections.get(roomId).size === 0) {
          connections.delete(roomId);
        }
      }
    });
    
  } else if (req.method === 'POST') {
    // Send message
    const { roomId, userId, message, messageId } = req.body;
    
    if (!roomId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    broadcastToRoom(roomId, {
      type: 'new-message',
      messageId: messageId || `msg_${Date.now()}`,
      userId: userId,
      message: message,
      timestamp: new Date().toISOString()
    });
    
    res.status(200).json({ success: true });
    
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

function broadcastToRoom(roomId, data) {
  if (connections.has(roomId)) {
    const roomConnections = connections.get(roomId);
    for (const [userId, res] of roomConnections) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        console.log('Connection closed for user:', userId);
        roomConnections.delete(userId);
      }
    }
  }
}