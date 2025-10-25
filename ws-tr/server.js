const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false,
  maxPayload: 16 * 1024 * 1024,
});

console.log(`ws sunucu ${PORT} portunda`);

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('olu baglanti kapatiliyor');
      for (const [playerId, connection] of playerConnections.entries()) {
        if (connection === ws) {
          handlePlayerDisconnect(playerId);
          break;
        }
      }
      return ws.terminate();
    }
    
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (error) {
      console.error('ping hatasi', error);
    }
  });
}, 30000);

process.on('SIGTERM', () => {
  clearInterval(heartbeatInterval);
  wss.close();
});

const gameRooms = new Map();
const playerConnections = new Map();

const GameState = {
  WAITING: 'waiting',
  STARTING: 'starting',
  WORD_SHOWN: 'wordShown',
  DISCUSSION: 'discussion',
  VOTING: 'voting',
  FINISHED: 'finished'
};

const categories = {
  'Hayvanlar': ['Aslan', 'Kaplan', 'Fil', 'Zürafa', 'Kartal', 'Balık', 'Kedi', 'Köpek', 'At', 'İnek'],
  'Yiyecekler': ['Pizza', 'Hamburger', 'Döner', 'Lahmacun', 'Kebap', 'Pasta', 'Dondurma', 'Çikolata', 'Elma', 'Muz'],
  'Meslekler': ['Doktor', 'Öğretmen', 'Mühendis', 'Avukat', 'Hemşire', 'Polis', 'İtfaiyeci', 'Pilot', 'Şoför', 'Aşçı'],
  'Eşyalar': ['Masa', 'Sandalye', 'Telefon', 'Bilgisayar', 'Kitap', 'Kalem', 'Çanta', 'Saat', 'Ayna', 'Lamba']
};

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getRandomWord(category) {
  const words = categories[category] || categories['Hayvanlar'];
  return words[Math.floor(Math.random() * words.length)];
}

function selectSpies(players, spyCount = 1) {
  if (spyCount >= players.length) {
    spyCount = Math.floor(players.length / 2);
  }
  const shuffled = [...players].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, spyCount).map(p => p.id);
}

function broadcastToRoom(roomCode, message, excludePlayerId = null) {
  const room = gameRooms.get(roomCode);
  if (!room) return;

  room.players.forEach(player => {
    if (player.id !== excludePlayerId) {
      const connection = playerConnections.get(player.id);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(message));
      }
    }
  });
}

function handlePlayerDisconnect(playerId) {
  console.log(`oyuncu baglanti kesildi ${playerId}`);
  
  const connection = playerConnections.get(playerId);
  if (connection) {
    playerConnections.delete(playerId);
  }
  
  for (const [roomCode, room] of gameRooms.entries()) {
    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      const playerName = room.players[playerIndex].name;
      room.players.splice(playerIndex, 1);
      
      console.log(`oyuncu odadan cikarildi ${playerName} ${playerId} oda ${roomCode}`);
      
      if (room.players.length === 0) {
        console.log(`oda silindi ${roomCode}`);
        gameRooms.delete(roomCode);
      } else {
        if (room.hostId === playerId && room.players.length > 0) {
          room.hostId = room.players[0].id;
          console.log(`yeni host ${room.players[0].name} ${room.hostId}`);
        }
        
        const updateMessage = {
          type: 'playerLeft',
          playerId: playerId,
          playerName: playerName,
          room: {
            code: roomCode,
            players: room.players,
            hostId: room.hostId,
            state: room.state,
            category: room.category
          }
        };
        
        console.log('oyuncu ayrilma bildirimi', updateMessage);
        broadcastToRoom(roomCode, updateMessage);
      }
      break;
    }
  }
}

wss.on('connection', (ws) => {
  console.log('baglanti kuruldu');
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('gelen mesaj', message);
      
      switch (message.type) {
        case 'createRoom':
          handleCreateRoom(ws, message);
          break;
        case 'joinRoom':
          handleJoinRoom(ws, message);
          break;
        case 'startGame':
          handleStartGame(ws, message);
          break;
        case 'showWord':
          handleShowWord(ws, message);
          break;
        case 'startDiscussion':
          handleStartDiscussion(ws, message);
          break;
        case 'startVoting':
          handleStartVoting(ws, message);
          break;
        case 'vote':
          handleVote(ws, message);
          break;
        case 'restartGame':
          handleRestartGame(ws, message);
          break;
        case 'leaveRoom':
          handleLeaveRoom(ws, message);
          break;
        case 'ping':
          ws.isAlive = true;
          try {
            ws.send(JSON.stringify({ type: 'pong' }));
          } catch (error) {
            console.error('pong hatasi', error);
          }
          break;
        default:
          console.log('bilinmeyen mesaj tipi', message.type);
      }
    } catch (error) {
      console.error('mesaj isleme hatasi', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Mesaj işlenirken hata oluştu'
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('baglanti kesildi');
    for (const [playerId, connection] of playerConnections.entries()) {
      if (connection === ws) {
        handlePlayerDisconnect(playerId);
        break;
      }
    }
  });
});

function handleCreateRoom(ws, message) {
  try {
    const roomCode = generateRoomCode();
    const playerId = uuidv4();
    
    const player = {
      id: playerId,
      name: message.playerName,
      isConnected: true
    };
    
    const room = {
      code: roomCode,
      hostId: playerId,
      players: [player],
      state: GameState.WAITING,
      category: null,
      word: null,
      spies: [],
      spyCount: 1,
      showSpyCountToPlayers: false,
      allowSpyDiscussion: true,
      spyHintsEnabled: true,
      maxPlayers: 8,
      autoStart: false,
      votes: new Map(),
      createdAt: new Date()
    };
    
    gameRooms.set(roomCode, room);
    playerConnections.set(playerId, ws);
    
    console.log(`oda olusturuldu ${roomCode} oyuncu ${message.playerName}`);
    
    const response = {
      type: 'roomCreated',
      playerId: playerId,
      room: {
        code: roomCode,
        players: room.players,
        hostId: room.hostId,
        state: room.state,
        category: room.category
      }
    };
    
    console.log('yanit gonderiliyor', response);
    ws.send(JSON.stringify(response));
  } catch (error) {
    console.error('oda olusturma hatasi', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Oda oluşturulamadı: ' + error.message
    }));
  }
}

function handleJoinRoom(ws, message) {
  try {
    console.log(`odaya katilma istegi ${message.roomCode} oyuncu ${message.playerName}`);
    
    const room = gameRooms.get(message.roomCode);
    
    if (!room) {
      console.log(`Oda bulunamadı: ${message.roomCode}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Oda bulunamadı'
      }));
      return;
    }
    
    if (room.state !== GameState.WAITING) {
      console.log(`oyun basladi katilim reddedildi ${message.roomCode}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Oyun başlamış, katılamazsınız'
      }));
      return;
    }
    
    const existingPlayer = room.players.find(p => p.name.toLowerCase() === message.playerName.toLowerCase());
    if (existingPlayer) {
      console.log(`ayni isimde oyuncu var ${message.playerName}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Bu isimde bir oyuncu zaten odada'
      }));
      return;
    }
    
    if (room.players.length >= (room.maxPlayers || 8)) {
      console.log(`oda dolu ${room.players.length}/${room.maxPlayers || 8}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Oda dolu'
      }));
      return;
    }
    
    const playerId = uuidv4();
    const player = {
      id: playerId,
      name: message.playerName,
      isConnected: true,
      joinedAt: new Date()
    };
    
    room.players.push(player);
    playerConnections.set(playerId, ws);
    
    console.log(`oyuncu katildi ${message.playerName} ${playerId} oda ${message.roomCode}`);
    
    // Katılan oyuncuya bilgi gönder
    const joinResponse = {
      type: 'roomJoined',
      playerId: playerId,
      room: {
        code: room.code,
        players: room.players,
        hostId: room.hostId,
        state: room.state,
        category: room.category
      }
    };
    
    console.log('katilim yaniti', joinResponse);
    ws.send(JSON.stringify(joinResponse));
    
    broadcastToRoom(message.roomCode, {
      type: 'playerJoined',
      player: player,
      room: {
        code: room.code,
        players: room.players,
        hostId: room.hostId,
        state: room.state,
        category: room.category
      }
    }, playerId);
    
    console.log(`toplam oyuncu ${room.players.length}`);
  } catch (error) {
    console.error('odaya katilma hatasi', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Odaya katılırken hata oluştu: ' + error.message
    }));
  }
}

function handleStartGame(ws, message) {
  const room = gameRooms.get(message.roomCode);
  
  if (!room || room.hostId !== message.playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Oyunu sadece host başlatabilir'
    }));
    return;
  }
  
  if (room.players.length < 3) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'En az 3 oyuncu gerekli'
    }));
    return;
  }
  
  room.state = GameState.STARTING;
  room.category = message.category;
  room.word = getRandomWord(message.category);
  
  if (message.settings) {
    room.spyCount = message.settings.spyCount || room.spyCount;
    room.showSpyCountToPlayers = message.settings.showSpyCountToPlayers || room.showSpyCountToPlayers;
    room.allowSpyDiscussion = message.settings.allowSpyDiscussion !== undefined ? message.settings.allowSpyDiscussion : room.allowSpyDiscussion;
    room.spyHintsEnabled = message.settings.spyHintsEnabled !== undefined ? message.settings.spyHintsEnabled : room.spyHintsEnabled;
  }
  
  room.spies = selectSpies(room.players, room.spyCount);
  room.votes = new Map();
  
  broadcastToRoom(message.roomCode, {
    type: 'gameStarted',
    room: {
      code: room.code,
      players: room.players,
      hostId: room.hostId,
      state: room.state,
      category: room.category
    }
  });
}

function handleShowWord(ws, message) {
  try {
    const room = gameRooms.get(message.roomCode);
    
    if (!room) {
      console.log(`oda bulunamadi ${message.roomCode}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Oda bulunamadı'
      }));
      return;
    }
    
    if (room.hostId !== message.playerId) {
      console.log(`yetkisiz kelime gosterme ${message.playerId} host ${room.hostId}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Bu işlemi sadece host yapabilir'
      }));
      return;
    }
    
    if (room.state !== GameState.STARTING) {
      console.log(`yanlis durum ${room.state} kelime gosterilemez`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Kelime sadece oyun başlangıcında gösterilebilir'
      }));
      return;
    }
    
    room.state = GameState.WORD_SHOWN;
    
    console.log(`kelime gosteriliyor ${room.word} kategori ${room.category} casuslar ${room.spies.join(' ')}`);
    
    let successCount = 0;
    let failCount = 0;
    
    room.players.forEach(player => {
      const connection = playerConnections.get(player.id);
      const isSpy = room.spies.includes(player.id);
      
      if (connection && connection.readyState === WebSocket.OPEN) {
        try {
          const playerMessage = {
            type: 'wordShown',
            word: isSpy ? null : room.word,
            category: room.category,
            isSpy: isSpy,
            spyCount: room.showSpyCountToPlayers ? room.spyCount : null,
            otherSpies: (isSpy && room.allowSpyDiscussion) ? 
              room.spies.filter(spyId => spyId !== player.id)
                       .map(spyId => room.players.find(p => p.id === spyId)?.name).filter(Boolean) : [],
            spyHintsEnabled: room.spyHintsEnabled,
            room: {
              code: room.code,
              players: room.players,
              hostId: room.hostId,
              state: room.state,
              category: room.category
            }
          };
          
          connection.send(JSON.stringify(playerMessage));
          successCount++;
          console.log(`${player.name} ${isSpy ? 'casus' : 'normal'} mesaj gonderildi`);
        } catch (error) {
          failCount++;
          console.error(`${player.name} mesaj gonderme hatasi`, error);
        }
      } else {
        failCount++;
        console.log(`${player.name} baglanti yok`);
        player.isConnected = false;
      }
    });
    
    console.log(`kelime gosterme tamam basarili ${successCount} basarisiz ${failCount}`);
    
    if (successCount === 0) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Hiçbir oyuncuya mesaj gönderilemedi'
      }));
    }
    
  } catch (error) {
    console.error('kelime gosterme hatasi', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Kelime gösterilirken hata oluştu: ' + error.message
    }));
  }
}

function handleStartDiscussion(ws, message) {
  const room = gameRooms.get(message.roomCode);
  
  if (!room || room.hostId !== message.playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Bu işlemi sadece host yapabilir'
    }));
    return;
  }
  
  room.state = GameState.DISCUSSION;
  
  broadcastToRoom(message.roomCode, {
    type: 'discussionStarted',
    room: {
      code: room.code,
      players: room.players,
      hostId: room.hostId,
      state: room.state,
      category: room.category
    }
  });
}

function handleStartVoting(ws, message) {
  const room = gameRooms.get(message.roomCode);
  
  if (!room || room.hostId !== message.playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Bu işlemi sadece host yapabilir'
    }));
    return;
  }
  
  room.state = GameState.VOTING;
  room.votes.clear();
  
  broadcastToRoom(message.roomCode, {
    type: 'votingStarted',
    room: {
      code: room.code,
      players: room.players,
      hostId: room.hostId,
      state: room.state,
      category: room.category
    }
  });
}

function handleVote(ws, message) {
  const room = gameRooms.get(message.roomCode);
  
  if (!room || room.state !== GameState.VOTING) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Şu anda oylama yapılamaz'
    }));
    return;
  }
  
  room.votes.set(message.playerId, message.votedPlayerId);
  
  if (room.votes.size === room.players.length) {
    const voteCounts = new Map();
    const voteDetails = new Map();
    
    for (const [voterId, votedId] of room.votes.entries()) {
      voteCounts.set(votedId, (voteCounts.get(votedId) || 0) + 1);
      if (!voteDetails.has(votedId)) {
        voteDetails.set(votedId, []);
      }
      const voter = room.players.find(p => p.id === voterId);
      voteDetails.get(votedId).push(voter.name);
    }
    
    let maxVotes = 0;
    let suspectedPlayerId = null;
    for (const [playerId, votes] of voteCounts.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        suspectedPlayerId = playerId;
      }
    }
    
    const spyWins = !room.spies.includes(suspectedPlayerId);
    room.state = GameState.FINISHED;
    
    broadcastToRoom(message.roomCode, {
      type: 'gameFinished',
      results: {
        spyWins: spyWins,
        word: room.word,
        spies: room.spies.map(spyId => room.players.find(p => p.id === spyId)),
        suspectedPlayer: room.players.find(p => p.id === suspectedPlayerId),
        voteCounts: Object.fromEntries(
          Array.from(voteCounts.entries()).map(([playerId, count]) => [
            room.players.find(p => p.id === playerId).name,
            count
          ])
        ),
        voteDetails: Object.fromEntries(
          Array.from(voteDetails.entries()).map(([playerId, voters]) => [
            room.players.find(p => p.id === playerId).name,
            voters
          ])
        )
      },
      room: {
        code: room.code,
        players: room.players,
        hostId: room.hostId,
        state: room.state,
        category: room.category
      }
    });
  } else {
    broadcastToRoom(message.roomCode, {
      type: 'voteUpdate',
      votedCount: room.votes.size,
      totalPlayers: room.players.length
    });
  }
}

function handleRestartGame(ws, message) {
  const room = gameRooms.get(message.roomCode);
  
  if (!room || room.hostId !== message.playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Oyunu sadece host yeniden başlatabilir'
    }));
    return;
  }
  
  room.state = GameState.WAITING;
  room.category = null;
  room.word = null;
  room.spies = [];
  room.votes.clear();
  
  broadcastToRoom(message.roomCode, {
    type: 'gameRestarted',
    room: {
      code: room.code,
      players: room.players,
      hostId: room.hostId,
      state: room.state,
      category: room.category
    }
  });
}

function handleLeaveRoom(ws, message) {
  try {
    const room = gameRooms.get(message.roomCode);
    if (!room) return;
    
    const playerIndex = room.players.findIndex(p => p.id === message.playerId);
    if (playerIndex === -1) return;
    
    room.players.splice(playerIndex, 1);
    playerConnections.delete(message.playerId);
    
    if (room.players.length === 0) {
      gameRooms.delete(message.roomCode);
      return;
    }
    
    if (room.hostId === message.playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }
    
    broadcastToRoom(message.roomCode, {
      type: 'playerLeft',
      playerId: message.playerId,
      room: {
        code: room.code,
        players: room.players,
        hostId: room.hostId,
        state: room.state,
        category: room.category
      }
    });
    
    console.log(`oyuncu odadan ayrildi ${message.playerId} oda ${message.roomCode}`);
  } catch (error) {
    console.error('odadan ayrilma hatasi', error);
  }
}

process.on('SIGTERM', () => {
  console.log('sunucu kapatiliyor');
  wss.close(() => {
    console.log('ws sunucu kapatildi');
    process.exit(0);
  });
}); 