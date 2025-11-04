// SecretChat Application - Serverless Version
class SecretChat {
    constructor() {
        this.currentRoomId = null;
        this.userId = null;
        this.eventSource = null;
        this.isHost = false;
        this.partnerJoined = false;
        this.roomStartTime = null;
        this.roomDurationInterval = null;
        this.typingTimer = null;
        
        this.initializeApp();
    }

    initializeApp() {
        this.bindEvents();
        this.checkURLForRoom();
        this.updateStats();
    }

    bindEvents() {
        // Create room button
        document.getElementById('createRoomBtn').addEventListener('click', () => this.handleCreateRoom());
        
        // Join room button
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.handleJoinRoom());
        
        // Send message
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.handleSendMessage());
        
        // Message input events
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSendMessage();
            }
        });

        document.getElementById('messageInput').addEventListener('input', () => this.handleTyping());
        
        // Copy link button
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyLinkToClipboard());
        
        // Leave chat button
        document.getElementById('leaveChatBtn').addEventListener('click', () => this.leaveChat());
    }

    async handleCreateRoom() {
        const roomName = document.getElementById('roomName').value;
        const initialMessage = document.getElementById('initialMessage').value;
        
        const createBtn = document.getElementById('createRoomBtn');
        createBtn.innerHTML = '<div class="loading"></div> Membuat Room...';
        createBtn.disabled = true;

        try {
            const success = await this.createRoom(roomName, initialMessage);
            if (success) {
                this.showAlert('🎉 Room berhasil dibuat! Bagikan linknya sekarang.', 'success');
                this.updateStats();
            }
        } catch (error) {
            this.showAlert('❌ Gagal membuat room: ' + error.message, 'error');
        } finally {
            createBtn.innerHTML = '<i class="fas fa-key"></i> Buat Room Chat';
            createBtn.disabled = false;
        }
    }

    async handleJoinRoom() {
        const joinLink = document.getElementById('joinLink').value;
        if (!joinLink) {
            this.showAlert('⚠️ Masukkan link chat terlebih dahulu!', 'error');
            return;
        }

        const roomId = this.extractRoomIdFromURL(joinLink);
        if (!roomId) {
            this.showAlert('❌ Link chat tidak valid!', 'error');
            return;
        }

        const joinBtn = document.getElementById('joinRoomBtn');
        joinBtn.innerHTML = '<div class="loading"></div> Bergabung...';
        joinBtn.disabled = true;

        try {
            const success = await this.joinRoom(roomId);
            if (success) {
                this.showAlert('✅ Berhasil bergabung ke chat rahasia!', 'success');
            }
        } catch (error) {
            this.showAlert('❌ Gagal bergabung: ' + error.message, 'error');
        } finally {
            joinBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Masuk ke Chat';
            joinBtn.disabled = false;
        }
    }

    extractRoomIdFromURL(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('room');
        } catch {
            const match = url.match(/room=([a-zA-Z0-9-]+)/);
            return match ? match[1] : null;
        }
    }

    async createRoom(roomName, initialMessage) {
        try {
            const response = await fetch('/api/create-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomName: roomName || 'Chat Rahasia',
                    initialMessage: initialMessage
                })
            });

            const data = await response.json();

            if (data.success) {
                this.currentRoomId = data.roomId;
                this.isHost = true;
                this.userId = `host_${Date.now()}`;
                
                // Show room link section
                document.getElementById('roomLink').value = data.roomUrl;
                document.getElementById('roomLinkSection').style.display = 'block';
                
                // Connect to room
                this.connectToRoom();
                
                return true;
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Create room error:', error);
            throw error;
        }
    }

    async joinRoom(roomId) {
        try {
            // Check if room exists first
            const response = await fetch(`/api/room-info?roomId=${roomId}`);
            const data = await response.json();

            if (data.success) {
                this.currentRoomId = roomId;
                this.isHost = false;
                this.userId = `guest_${Date.now()}`;
                
                this.connectToRoom();
                return true;
            } else {
                throw new Error('Room tidak ditemukan atau sudah expired');
            }
        } catch (error) {
            console.error('Join room error:', error);
            throw error;
        }
    }

    connectToRoom() {
        if (!this.currentRoomId) return;

        // Close existing connection
        if (this.eventSource) {
            this.eventSource.close();
        }

        // Show chat room UI
        this.showChatRoom();
        
        // Start room duration timer if host
        if (this.isHost) {
            this.startRoomDurationTimer();
        }

        // Connect via Server-Sent Events
        this.eventSource = new EventSource(
            `/api/socket-handler?roomId=${this.currentRoomId}&userId=${this.userId}`
        );

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerEvent(data);
            } catch (error) {
                console.error('Error parsing server event:', error);
            }
        };

        this.eventSource.onopen = () => {
            this.updateConnectionStatus(true);
            console.log('Connected to room:', this.currentRoomId);
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE Connection error:', error);
            this.updateConnectionStatus(false);
            
            // Try to reconnect after 3 seconds
            setTimeout(() => {
                if (this.currentRoomId) {
                    this.connectToRoom();
                }
            }, 3000);
        };

        // If host, send welcome message
        if (this.isHost) {
            setTimeout(() => {
                this.addSystemMessage('👋 Anda telah membuat room chat rahasia. Bagikan link dan tunggu hingga seseorang bergabung...');
            }, 500);
        }
    }

    handleServerEvent(data) {
        switch (data.type) {
            case 'connected':
                this.handleConnected(data);
                break;
                
            case 'new-message':
                this.handleNewMessage(data);
                break;
                
            case 'user-joined':
                this.handleUserJoined(data);
                break;
                
            case 'user-left':
                this.handleUserLeft(data);
                break;
                
            case 'user-typing':
                this.handleUserTyping(data);
                break;
                
            default:
                console.log('Unknown event type:', data.type);
        }
    }

    handleConnected(data) {
        this.updateConnectionStatus(true);
        this.addSystemMessage('✅ Terhubung ke room chat');
    }

    handleNewMessage(data) {
        const isOwnMessage = data.userId === this.userId;
        
        this.addMessageToChat({
            id: data.messageId,
            text: data.message,
            username: isOwnMessage ? 'Anda' : 'Anonymous',
            timestamp: new Date(data.timestamp),
            type: 'text',
            status: isOwnMessage ? 'sent' : 'received'
        });

        // Update read status for own messages
        if (isOwnMessage) {
            setTimeout(() => {
                this.updateMessageStatus(data.messageId, 'delivered');
            }, 1000);

            setTimeout(() => {
                this.updateMessageStatus(data.messageId, 'read');
            }, 2000);
        }
    }

    handleUserJoined(data) {
        this.partnerJoined = true;
        this.updateParticipantCount(data.participantCount || 2);
        this.addSystemMessage('👤 Seseorang bergabung ke chat!');
        this.showNotification('Seseorang bergabung ke chat');
    }

    handleUserLeft(data) {
        this.partnerJoined = false;
        this.updateParticipantCount(data.participantCount || 1);
        this.addSystemMessage('🚪 Seseorang meninggalkan chat');
    }

    handleUserTyping(data) {
        this.showTypingIndicator(data.typing);
    }

    handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message || !this.currentRoomId) return;

        this.sendMessage(message);
        messageInput.value = '';
    }

    async sendMessage(messageText) {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add message to chat immediately (optimistic update)
        this.addMessageToChat({
            id: messageId,
            text: messageText,
            username: 'Anda',
            timestamp: new Date(),
            type: 'text',
            status: 'sending'
        });

        // Send to server
        try {
            const response = await fetch('/api/socket-handler', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomId: this.currentRoomId,
                    userId: this.userId,
                    message: messageText,
                    messageId: messageId
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.updateMessageStatus(messageId, 'error');
            this.showAlert('❌ Gagal mengirim pesan', 'error');
        }
    }

    handleTyping() {
        if (!this.currentRoomId || !this.partnerJoined) return;

        // Send typing start event
        this.sendTypingEvent(true);
        
        // Clear existing timer
        clearTimeout(this.typingTimer);
        
        // Set timer to send typing stop
        this.typingTimer = setTimeout(() => {
            this.sendTypingEvent(false);
        }, 1000);
    }

    async sendTypingEvent(isTyping) {
        try {
            await fetch('/api/socket-handler', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    roomId: this.currentRoomId,
                    userId: this.userId,
                    type: 'typing',
                    typing: isTyping
                })
            });
        } catch (error) {
            console.error('Error sending typing event:', error);
        }
    }

    // UI Management Methods
    showChatRoom() {
        document.querySelector('.main-content').style.display = 'none';
        document.getElementById('chatRoom').style.display = 'flex';
        
        // Update room title
        document.getElementById('chatRoomTitle').textContent = 'Chat Rahasia';
        
        // Enable chat input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendMessageBtn').disabled = false;
        document.getElementById('messageInput').focus();
        
        // Clear previous messages
        document.getElementById('chatMessages').innerHTML = '';
        
        // Add welcome message
        const welcomeMessage = this.isHost 
            ? '🎯 Anda adalah host. Bagikan link dan tunggu partner bergabung...'
            : '🔐 Anda telah bergabung secara anonim. Identitas Anda rahasia.';
            
        this.addSystemMessage(welcomeMessage);
    }

    addMessageToChat(message) {
        const chatMessages = document.getElementById('chatMessages');
        const isSent = message.username === 'Anda';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.setAttribute('data-message-id', message.id);
        
        const timeString = message.timestamp.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let statusHtml = '';
        if (isSent && message.status) {
            let statusIcon = '';
            let statusClass = '';
            
            switch (message.status) {
                case 'sending': statusIcon = '⏳'; break;
                case 'sent': statusIcon = '✓'; statusClass = 'status-sent'; break;
                case 'delivered': statusIcon = '✓✓'; statusClass = 'status-delivered'; break;
                case 'read': statusIcon = '✓✓'; statusClass = 'status-read'; break;
                case 'error': statusIcon = '❌'; statusClass = 'status-error'; break;
            }
            
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.text)}</div>
            <div class="message-time">
                ${timeString}
                ${statusHtml}
            </div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addSystemMessage(text) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(text)}</div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            if (statusElement) {
                let statusIcon = '';
                let statusClass = '';
                
                switch (status) {
                    case 'sent': statusIcon = '✓'; statusClass = 'status-sent'; break;
                    case 'delivered': statusIcon = '✓✓'; statusClass = 'status-delivered'; break;
                    case 'read': statusIcon = '✓✓'; statusClass = 'status-read'; break;
                    case 'error': statusIcon = '❌'; statusClass = 'status-error'; break;
                }
                
                statusElement.textContent = statusIcon;
                statusElement.className = `message-status ${statusClass}`;
            }
        }
    }

    updateParticipantCount(count) {
        const participantCount = document.getElementById('participantCount');
        const partnerStatus = document.getElementById('partnerStatus');
        
        participantCount.textContent = count + ' orang dalam chat';
        
        if (count > 1) {
            partnerStatus.classList.add('active');
            participantCount.style.color = '#10b981';
        } else {
            partnerStatus.classList.remove('active');
            participantCount.style.color = '#6b7280';
        }
        
        // Update room info if host
        if (this.isHost) {
            document.getElementById('roomParticipantCount').textContent = count;
        }
    }

    updateConnectionStatus(connected) {
        const connectionStatus = document.getElementById('connectionStatus');
        const connectionText = document.getElementById('connectionText');
        
        if (connected) {
            connectionStatus.classList.add('connected');
            connectionText.textContent = 'Terhubung';
            connectionText.style.color = '#10b981';
        } else {
            connectionStatus.classList.remove('connected');
            connectionText.textContent = 'Terputus';
            connectionText.style.color = '#ef4444';
        }
    }

    showTypingIndicator(show) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (show) {
            typingIndicator.textContent = 'Anonymous sedang mengetik...';
            typingIndicator.classList.add('active');
        } else {
            typingIndicator.textContent = '';
            typingIndicator.classList.remove('active');
        }
    }

    // Room Duration Timer
    startRoomDurationTimer() {
        this.roomStartTime = new Date();
        
        if (this.roomDurationInterval) {
            clearInterval(this.roomDurationInterval);
        }
        
        this.roomDurationInterval = setInterval(() => {
            if (this.roomStartTime) {
                const now = new Date();
                const duration = Math.floor((now - this.roomStartTime) / 1000 / 60); // in minutes
                document.getElementById('roomDuration').textContent = duration + ' menit';
            }
        }, 60000); // Update every minute
    }

    // Utility Methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAlert(message, type = 'success') {
        const alertDiv = document.getElementById('alert');
        alertDiv.textContent = message;
        alertDiv.className = `alert alert-${type}`;
        alertDiv.style.display = 'block';
        
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 5000);
    }

    showNotification(message) {
        // Simple notification using alert for now
        console.log('Notification:', message);
    }

    copyLinkToClipboard() {
        const roomLink = document.getElementById('roomLink');
        roomLink.select();
        roomLink.setSelectionRange(0, 99999); // For mobile devices
        
        navigator.clipboard.writeText(roomLink.value).then(() => {
            this.showAlert('✅ Link berhasil disalin ke clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            document.execCommand('copy');
            this.showAlert('✅ Link berhasil disalin!', 'success');
        });
    }

    leaveChat() {
        // Close connection
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        // Clear intervals
        if (this.roomDurationInterval) {
            clearInterval(this.roomDurationInterval);
            this.roomDurationInterval = null;
        }
        
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
        
        // Reset state
        this.currentRoomId = null;
        this.userId = null;
        this.isHost = false;
        this.partnerJoined = false;
        this.roomStartTime = null;
        
        // Show main content
        document.getElementById('chatRoom').style.display = 'none';
        document.querySelector('.main-content').style.display = 'grid';
        document.getElementById('roomLinkSection').style.display = 'none';
        
        this.showAlert('👋 Anda telah keluar dari chat.', 'success');
    }

    // URL Check on Load
    checkURLForRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        
        if (roomId) {
            document.getElementById('joinLink').value = window.location.href;
            // Auto-join after short delay
            setTimeout(() => {
                this.joinRoom(roomId).catch(error => {
                    this.showAlert('❌ Gagal bergabung ke room: ' + error.message, 'error');
                });
            }, 1000);
        }
    }

    // Stats Management
    updateStats() {
        // Simulate some random stats for demo
        const totalRooms = Math.floor(Math.random() * 50) + 100;
        const activeChats = Math.floor(Math.random() * 30) + 15;
        
        document.getElementById('totalRooms').textContent = totalRooms;
        document.getElementById('activeChats').textContent = activeChats;
    }
}

// Share Functions (Global)
function shareViaWhatsApp() {
    const roomLink = document.getElementById('roomLink').value;
    const text = `Hai! Aku ingin ngobrol secara rahasia denganmu. Klik link ini: ${roomLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareViaTelegram() {
    const roomLink = document.getElementById('roomLink').value;
    const text = `Hai! Aku ingin ngobrol secara rahasia denganmu. Klik link ini: ${roomLink}`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(roomLink)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

function shareViaSMS() {
    const roomLink = document.getElementById('roomLink').value;
    const text = `Hai! Aku ingin ngobrol secara rahasia denganmu. Klik link ini: ${roomLink}`;
    const url = `sms:?body=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Chat Management Functions (Global)
function clearChat() {
    if (confirm('Apakah Anda yakin ingin menghapus semua pesan?')) {
        document.getElementById('chatMessages').innerHTML = '';
        secretChat.addSystemMessage('💬 Chat telah dibersihkan');
    }
}

function exportChat() {
    const messages = document.getElementById('chatMessages').innerText;
    const blob = new Blob([messages], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    secretChat.showAlert('📥 Chat berhasil diexport!', 'success');
}

// Initialize the application
const secretChat = new SecretChat();

// Make functions globally available
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareViaTelegram = shareViaTelegram;
window.shareViaSMS = shareViaSMS;
window.clearChat = clearChat;
window.exportChat = exportChat;