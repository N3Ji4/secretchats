import { v4 as uuidv4 } from 'uuid';

// Simple in-memory storage (in production, use Redis/Vercel KV)
const rooms = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { roomName, initialMessage } = req.body;
    const roomId = uuidv4();
    
    const room = {
      id: roomId,
      name: roomName || 'Chat Rahasia',
      participants: new Set(),
      messages: [],
      createdAt: new Date().toISOString(),
      initialMessage: initialMessage || ''
    };
    
    rooms.set(roomId, room);
    
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    
    res.status(200).json({
      success: true,
      roomId: roomId,
      roomUrl: `${baseUrl}?room=${roomId}`,
      message: 'Room created successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}