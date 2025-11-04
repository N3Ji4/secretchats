// Simple in-memory storage
const rooms = new Map();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomId } = req.query;

  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ 
      success: false,
      error: 'Room not found' 
    });
  }
  
  res.status(200).json({
    success: true,
    room: {
      id: room.id,
      name: room.name,
      participantCount: room.participants.size,
      createdAt: room.createdAt
    }
  });
}