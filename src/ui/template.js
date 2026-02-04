export const appTemplate = `
  <div class="app">
    <header class="title">
      <div>
        <p class="eyebrow">Neon Arcana</p>
        <h1 id="appTitle" class="clickable" title="Back to main">Mage Duel: Mana Weaving</h1>
        <p class="sub">Static combat. Real-time decisions. Invest mana to outplay your rival.</p>
      </div>
      <div class="status" id="status">Offline</div>
    </header>

    <section class="panel config" id="configPanel">
      <h2>Firebase Setup</h2>
      <p>Paste your Firebase client config and enable Anonymous Auth + Realtime Database.</p>
      <div class="grid">
        <label>API Key<input id="cfg_apiKey" /></label>
        <label>Auth Domain<input id="cfg_authDomain" /></label>
        <label>Database URL<input id="cfg_databaseURL" /></label>
        <label>Project ID<input id="cfg_projectId" /></label>
        <label>Storage Bucket<input id="cfg_storageBucket" /></label>
        <label>Messaging Sender ID<input id="cfg_messagingSenderId" /></label>
        <label>App ID<input id="cfg_appId" /></label>
      </div>
      <button id="saveConfig">Save Config</button>
    </section>

    <section class="panel lobby" id="lobbyPanel">
      <h2>Join A Duel</h2>
      <div class="grid two">
        <label>Display Name<input id="playerName" placeholder="Nova" /></label>
        <label>Room Code<input id="roomCode" placeholder="arcana-001" /></label>
      </div>
      <div class="roomVisibilityToggle">
        <label class="checkboxLabel">
          <input type="checkbox" id="privateRoomToggle" />
          <span>Create as private room (join by code only)</span>
        </label>
      </div>
      <div class="actions">
        <button id="joinRoom">Join Room</button>
        <button class="ghost" id="createRoom">Create New Room</button>
      </div>
      <div class="roomMeta" id="roomMeta"></div>
      <div class="roomList">
        <div class="roomListHeader">
          <h3>Open Rooms</h3>
          <button class="ghost" id="refreshRooms">Refresh</button>
        </div>
        <p class="muted roomListHint">Click a room to join or spectate.</p>
        <div id="roomsContainer" class="roomsContainer"></div>
      </div>
    </section>
    <section class="panel rules" id="rulesPanel">
      <h2>Pravidla</h2>
      <div class="rulesGrid">
        <div>
          <h3>Průběh kola</h3>
          <p>Každé kolo rozděluje manu mezi akce. Oba hráči plánují současně, pak se kolo vyhodnotí.</p>
          <p>Poškození = max(0, útok − štít soupeře).</p>
        </div>
        <div>
          <h3>Akce</h3>
          <ul>
            <li><strong>Útok (Attack):</strong> Přímé poškození soupeře.</li>
            <li><strong>Štít (Shield):</strong> Blokuje protivníkův útok.</li>
            <li><strong>Kanálování (Channel):</strong> Ulož manu na další kolo.</li>
            <li><strong>Regen:</strong> Invest 7 many = +1 regen navždy, invest 12 many = +2 regen navždy. Investice se sčítají.</li>
          </ul>
          <p><strong>Bonus:</strong> Investice 6 a více many do Útoku, Štítu nebo Kanálování přidá +2 k hodnotě té akce.</p>
        </div>
        <div>
          <h3>Regenerace many</h3>
          <p>Každé kolo získá základní regen + uloženou manu + trvalý bonus z investic do Regen (investice jsou aditivní po zbytek hry).</p>
        </div>
        <div>
          <h3>Výhra</h3>
          <p>Hráč s HP na nule prohrává. Pokud oba spadnou na nulu ve stejném kole, je to remíza.</p>
        </div>
      </div>
    </section>


    <section class="panel game hidden" id="gamePanel">
      <div class="gameHeader">
        <div>
          <h2 id="roomTitle">Room</h2>
          <p id="roundInfo">Waiting for duel to start...</p>
        </div>
        <div class="actions">
          <button id="startDuel" class="hidden">Start Duel</button>
          <button id="leaveRoom" class="ghost">Leave</button>
        </div>
      </div>

      <div class="arena">
        <div class="mage" id="selfCard">
          <h3 id="selfCardTitle">You</h3>
          <div class="playerStats">
            <div class="statCircle statCircleHp"><span class="statCircleLabel">HP</span><span id="selfHp">--</span></div>
            <div class="statCircle statCircleMana"><span class="statCircleLabel">Mana</span><span id="selfMana">--</span></div>
            <div class="statCircle statCircleRegen"><span class="statCircleLabel">Regen</span><span id="selfRegen">--</span></div>
          </div>
        </div>

        <div class="focus">
          <div class="timer" id="timer">--</div>
          <div class="sigils">
            <div class="sigil">Attack</div>
            <div class="sigil">Shield</div>
            <div class="sigil">Channel</div>
            <div class="sigil">Regen</div>
          </div>
          <div class="allocation" id="allocation">
            <div class="allocationRow">
              <label>Attack</label>
              <input type="range" id="attackRange" min="0" max="20" step="1" />
              <span id="attackValue">0</span>
            </div>
            <div class="allocationRow">
              <label>Shield</label>
              <input type="range" id="shieldRange" min="0" max="20" step="1" />
              <span id="shieldValue">0</span>
            </div>
          <div class="allocationRow">
            <label>Channel</label>
            <input type="range" id="channelRange" min="0" max="20" step="1" />
            <span id="channelValue">0</span>
          </div>
          <div class="allocationRow allocationRowRegen">
            <label>Regen</label>
            <div class="regenButtons">
              <input type="hidden" id="regenAmount" value="0" />
              <button type="button" id="regenBtn1" class="ghost">Regen +1: 7</button>
              <button type="button" id="regenBtn2" class="ghost">Regen +2: 12</button>
            </div>
          </div>
            <div class="allocationFooter">
              <div>Mana Left: <span id="manaLeft">0</span></div>
            </div>
          </div>
        </div>

        <div class="mage" id="enemyCard">
          <h3 id="enemyCardTitle">Opponent</h3>
          <div class="playerStats">
            <div class="statCircle statCircleHp"><span class="statCircleLabel">HP</span><span id="enemyHp">--</span></div>
            <div class="statCircle statCircleMana"><span class="statCircleLabel">Mana</span><span id="enemyMana">--</span></div>
            <div class="statCircle statCircleRegen"><span class="statCircleLabel">Regen</span><span id="enemyRegen">--</span></div>
          </div>
        </div>
      </div>

      <div id="lastRoundPanel" class="lastRound hidden">
        <div id="lastRoundContent"></div>
      </div>
      <div class="log" id="logPanel"></div>
    </section>
  </div>
`
