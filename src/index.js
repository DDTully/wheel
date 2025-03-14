// ========= Helper Functions =========

const rand = (m, M) => Math.random() * (M - m) + m;

const standardColors = [
  "#FF0000", // Red
  "#00FF00", // Green
  "#1E90FF", // DodgerBlue – a blue with higher luminance so black text is readable
  "#4682B4", // SteelBlue – a more subdued blue with good contrast
  "#FFFF00", // Yellow
  "#FF00FF", // Magenta
  "#00FFFF", // Cyan
  "#FFA500", // Orange
  "#800080", // Purple
  "#008000", // Dark Green
  "#FFD700", // Gold
  "#FF4500", // OrangeRed
  "#7FFF00", // Chartreuse
  "#8A2BE2", // BlueViolet
  "#FF69B4",  // HotPink
  "#DC143C", // Crimson
  "#CD5C5C"  // IndianRed
];

function truncateLabel(label) {
  return label.length > 15 ? label.substring(0, 12) + "..." : label;
}

function isColorReadable(backgroundColor) {
  const hex = backgroundColor.replace('#', '');
  let r, g, b;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  const sRGB = [r / 255, g / 255, b / 255];
  const linearRGB = sRGB.map(val =>
    val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  );
  const luminance = 0.2126 * linearRGB[0] + 0.7152 * linearRGB[1] + 0.0722 * linearRGB[2];
  const contrastRatio = (luminance + 0.05) / 0.05;
  return contrastRatio >= 4.5;
}

function getReadableRandomColor() {
  let color;
  do {
    color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  } while (!isColorReadable(color));
  return color;
}

function getRandomColor() {
  return getReadableRandomColor(); // Random readable color
  // return standardColors[Math.floor(Math.random() * standardColors.length)];
}

// ========= WheelSpinner Class =========

class WheelSpinner {
  constructor(container) {
    this.container = container;
    this.canvas = container.querySelector('.wheel');
    this.spinEl = container.querySelector('.spin');
    // New chip-style input:
    this.itemInput = container.querySelector('.item-input');
    this.chipContainer = container.querySelector('.chip-container');
    this.clearChipsBtn = container.querySelector('.clear-chips');
    this.ctx = this.canvas.getContext("2d");
    this.PI = Math.PI;
    this.TAU = 2 * Math.PI;
    this.sectors = [];
    this.arc = 0;
    this.tot = 0;
    this.friction = 0.991;
    this.angVel = 0;
    this.ang = 0;
    this.spinButtonClicked = false;
    this.currentSector = 0;
    this.audioContext = null;

    // Compute diameter based on the viewport (60% of the smaller dimension)
    const viewportSize = Math.min(window.innerWidth, window.innerHeight);
    this.dia = viewportSize * 0.8; // Adjust multiplier to change wheel size
    this.rad = this.dia / 2;

    // Set canvas dimensions to be square (ensuring a perfect circle)
    this.canvas.width = this.dia;
    this.canvas.height = this.dia;

    // (Optional) Adjust the wheel container size if present
    const wheelContainer = container.querySelector('.wheel-container');
    if (wheelContainer) {
      wheelContainer.style.width = this.dia + 'px';
      wheelContainer.style.height = this.dia + 'px';
    }

    // Initialize the chips (if any) and draw the wheel
    this.updateItems();
    this.updateWheel();

    // Spin button event
    this.spinEl.addEventListener("click", () => {
      if (!this.angVel) this.angVel = rand(0.25, 0.45);
      this.spinButtonClicked = true;
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
    });

    // Event listener for the chip input
    this.itemInput.addEventListener('keydown', (e) => {
      // Only create a chip when Enter is pressed (not on comma)
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = this.itemInput.value.trim();
        if (value !== '') {
          this.addChip(value);
          this.itemInput.value = '';
          this.updateItems();
          this.updateWheel();
        }
      }
      // If Backspace is pressed and the input is empty, remove the last chip.
      else if (e.key === 'Backspace' && this.itemInput.value === '') {
        const chips = this.chipContainer.querySelectorAll('.chip');
        if (chips.length > 0) {
          chips[chips.length - 1].remove();
          this.updateItems();
          this.updateWheel();
        }
      }
    });
    if (this.clearChipsBtn) {
      this.clearChipsBtn.addEventListener('click', () => {
        // Remove all chips from the chip container
        const chips = this.chipContainer.querySelectorAll('.chip');
        chips.forEach(chip => chip.remove());
        // Update the wheel's sectors to reflect the removal
        this.updateItems();
        this.updateWheel();
      });
    }

    // Attach the event listener for the item input (Enter creates a chip, etc.)
    this.itemInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = this.itemInput.value.trim();
        if (value !== '') {
          this.addChip(value);
          this.itemInput.value = '';
          this.updateItems();
          this.updateWheel();
        }
      } else if (e.key === 'Backspace' && this.itemInput.value === '') {
        const chips = this.chipContainer.querySelectorAll('.chip');
        if (chips.length > 0) {
          chips[chips.length - 1].remove();
          this.updateItems();
          this.updateWheel();
        }
      }
    });

    requestAnimationFrame(this.engine.bind(this));
  }

  addChip(value) {
    const chip = document.createElement('span');
    chip.className = 'chip';

    // Split the entered value on commas and trim whitespace
    let tokens = value.split(',').map(s => s.trim()).filter(s => s !== '');
    let multiplier = 1;
    // If the last token is numeric, treat it as a multiplier.
    if (tokens.length > 1 && !isNaN(tokens[tokens.length - 1])) {
      multiplier = Number(tokens[tokens.length - 1]);
      tokens.pop(); // Remove the multiplier token from the label tokens
    }

    // Store the label (joined back together) and multiplier as data attributes.
    const label = tokens.join(', ');
    chip.dataset.value = label;
    chip.dataset.multiplier = multiplier;

    // Create the remove button and prepend it.
    const removeBtn = document.createElement('span');
    removeBtn.className = 'remove-chip';
    removeBtn.textContent = '×'; // The red "x" can be styled via CSS.
    chip.prepend(removeBtn);

    // Append a text node with a space and the label.
    const textNode = document.createTextNode(' ' + label);
    chip.appendChild(textNode);

    // Remove the chip when the remove button is clicked.
    removeBtn.addEventListener('click', () => {
      chip.remove();
      this.updateItems();
      this.updateWheel();
    });

    // Insert the chip before the input so the input always remains at the end.
    this.chipContainer.insertBefore(chip, this.itemInput);
  }



  engine() {
    this.frame();
    requestAnimationFrame(this.engine.bind(this));
  }

  frame() {
    if (!this.angVel && this.spinButtonClicked) {
      const finalSector = this.sectors[this.getIndex()];
      this.spinButtonClicked = false;
      this.showWinnerModal(finalSector);
    }
    this.angVel *= this.friction;
    if (this.angVel < 0.002) this.angVel = 0;
    this.ang += this.angVel;
    this.ang %= this.TAU;

    const newSector = this.getIndex();
    if (newSector !== this.currentSector) {
      if (this.sectors.length > 0) {
        this.generateTick();
      }
      this.currentSector = newSector;
    }
    this.rotate();
  }

  rotate() {
    const sector = this.sectors[this.getIndex()];
    if (sector) {
      this.canvas.style.transform = `rotate(${this.ang - this.PI / 2}rad)`;
      this.spinEl.textContent = (!this.angVel) ? "SPIN" : truncateLabel(sector.label);
      this.spinEl.style.background = sector.color;
      this.spinEl.style.color = sector.text;
    }
  }

  getIndex() {
    if (this.tot === 0) return 0;
    return Math.floor(this.tot - (this.ang - this.PI / 2) / this.TAU * this.tot) % this.tot;
  }

  // Build sectors from the chips.
  updateItems() {
    const chipElements = this.chipContainer.querySelectorAll('.chip');
    let newSectors = [];
    if (chipElements.length === 0) {
      newSectors = [{
        color: '#f0f0f0',
        text: '#666666',
        label: 'Add items...'
      }];
    } else {
      chipElements.forEach(chip => {
        const label = chip.dataset.value;         // The label text (e.g. "Apple")
        const multiplier = Number(chip.dataset.multiplier) || 1; // The weight (e.g. 2)
        const color = getRandomColor();
        // Create one sector per multiplier value.
        for (let i = 0; i < multiplier; i++) {
          newSectors.push({
            color: color,
            text: '#333333',
            label: label
          });
        }
      });
    }
    this.sectors = newSectors;
    this.tot = this.sectors.length;
    this.arc = (this.tot === 0) ? 0 : this.TAU / this.tot;
    this.currentSector = 0;
  }



  updateWheel() {
    this.ctx.clearRect(0, 0, this.dia, this.dia);
    this.tot = this.sectors.length;
    this.arc = (this.tot === 0) ? 0 : this.TAU / this.tot;
    this.sectors.forEach((sector, i) => this.drawSector(sector, i));
  }

  drawSector(sector, i) {
    const startAngle = this.arc * i;
    const endAngle = startAngle + this.arc;
    this.ctx.beginPath();
    this.ctx.moveTo(this.rad, this.rad);
    this.ctx.arc(this.rad, this.rad, this.rad, startAngle, endAngle);
    this.ctx.closePath();
    this.ctx.fillStyle = sector.color;
    this.ctx.fill();

    let displayLabel = truncateLabel(sector.label);
    this.ctx.save();
    this.ctx.translate(this.rad, this.rad);
    this.ctx.rotate(startAngle + this.arc / 2);
    const fontSize = getComputedStyle(document.documentElement)
      .getPropertyValue('--wheel-font-size').trim();
    const fontFamily = getComputedStyle(document.documentElement)
      .getPropertyValue('--wheel-font-family').trim();
    this.ctx.font = `bold ${fontSize} ${fontFamily}`;
    this.ctx.textAlign = "right";
    this.ctx.fillStyle = sector.text;
    this.ctx.fillText(displayLabel, this.rad - 10, 10);
    this.ctx.restore();
  }

  generateTick() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  showWinnerModal(winner) {
    const modal = document.getElementById("winner-modal");
    const message = document.getElementById("winner-message");
    const closeBtn = document.getElementById("modal-close");
    const modalContent = modal.querySelector(".modal-content");

    message.textContent = `${winner.label}!`;
    modalContent.style.backgroundColor = winner.color;
    modal.style.display = "flex";
    closeBtn.onclick = function () {
      modal.style.display = "none";
    };
    setTimeout(() => {
      modal.style.display = "none";
    }, 5000);
  }
}

class DiceRoller {
  constructor(container) {
    this.container = container;
    this.diceCountInput = container.querySelector('.dice-count');
    this.diceSidesInput = container.querySelector('.dice-sides');
    this.rollButton = container.querySelector('.roll-dice');
    this.resultContainer = container.querySelector('.dice-result');

    // Attach event listener for rolling dice.
    this.rollButton.addEventListener('click', () => {
      this.rollDice();
    });
  }

  rollDice() {
    // Parse the number of dice and sides.
    const count = parseInt(this.diceCountInput.value) || 1;
    const sides = parseInt(this.diceSidesInput.value) || 6;

    // Clear any previous results.
    this.resultContainer.innerHTML = '';

    // Define animation parameters.
    const animationDuration = 1000; // milliseconds
    const intervalTime = 100;         // update every 100ms
    let elapsed = 0;

    // Use setInterval to simulate dice rolling animation.
    const interval = setInterval(() => {
      // Clear current temporary results.
      this.resultContainer.innerHTML = '';
      // For each die, generate a random value (for the animation phase).
      for (let i = 0; i < count; i++) {
        const dieSpan = document.createElement('span');
        dieSpan.className = 'die';
        const tempValue = Math.floor(Math.random() * sides) + 1;
        dieSpan.textContent = tempValue;
        this.resultContainer.appendChild(dieSpan);
      }
      elapsed += intervalTime;
      if (elapsed >= animationDuration) {
        clearInterval(interval);
        this.showFinalResult(count, sides);
      }
    }, intervalTime);
  }

  showFinalResult(count, sides) {
    this.resultContainer.innerHTML = '';
    let total = 0;
    for (let i = 0; i < count; i++) {
      const dieSpan = document.createElement('span');
      dieSpan.className = 'die final';
      const finalValue = Math.floor(Math.random() * sides) + 1;
      total += finalValue;
      dieSpan.textContent = finalValue;
      this.resultContainer.appendChild(dieSpan);
    }
    // Optionally, show the total sum.
    const totalDiv = document.createElement('div');
    totalDiv.className = 'dice-total';
    totalDiv.textContent = 'Total: ' + total;
    this.resultContainer.appendChild(totalDiv);
  }
}

// Global objects to keep track of tab instances.
let wheelSpinners = {}; // For WheelSpinner tabs
let diceRollers = {};   // For DiceRoller tabs
let tabCounter = 1;

// Assume your first tab (tab-1) is a WheelSpinner.
const firstTabContent = document.querySelector('.tab-content[data-tab-id="tab-1"]');
wheelSpinners["tab-1"] = new WheelSpinner(firstTabContent);

// --- Tab Management (Switching & Removing Tabs) ---
const tabBar = document.getElementById('tabs-bar');
const tabsContent = document.getElementById('tabs-content');

tabBar.addEventListener('click', function (e) {
  // If a close button is clicked.
  if (e.target.classList.contains('close-tab')) {
    e.stopPropagation();
    const tabToRemove = e.target.closest('.tab');
    const tabId = tabToRemove.getAttribute('data-tab-id');
    tabToRemove.remove();
    const tabContentToRemove = document.querySelector(`.tab-content[data-tab-id="${tabId}"]`);
    if (tabContentToRemove) {
      tabContentToRemove.remove();
    }
    // Remove from both instance maps.
    delete wheelSpinners[tabId];
    delete diceRollers[tabId];
    // If removed tab was active, activate another.
    if (tabToRemove.classList.contains('active')) {
      const remainingTab = document.querySelector('.tab:not(.add-tab)');
      if (remainingTab) {
        remainingTab.classList.add('active');
        const newActiveTabId = remainingTab.getAttribute('data-tab-id');
        const newActiveContent = document.querySelector(`.tab-content[data-tab-id="${newActiveTabId}"]`);
        if (newActiveContent) {
          newActiveContent.classList.add('active');
          newActiveContent.style.display = 'block';
        }
      }
    }
    return;
  }
  // Otherwise, switch tabs when clicking a tab header.
  if (e.target.classList.contains('tab') && !e.target.classList.contains('add-tab')) {
    const tabId = e.target.getAttribute('data-tab-id');
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    e.target.classList.add('active');
    const activeContent = document.querySelector(`.tab-content[data-tab-id="${tabId}"]`);
    if (activeContent) {
      activeContent.classList.add('active');
      activeContent.style.display = 'block';
    }
  }
});

// --- Adding a New Wheel Spinner Tab (existing functionality) ---
document.getElementById('add-tab').addEventListener('click', function () {
  tabCounter++;
  const newTabId = 'tab-' + tabCounter;
  const newTab = document.createElement('div');
  newTab.classList.add('tab');
  newTab.setAttribute('data-tab-id', newTabId);
  newTab.textContent = 'Wheel ' + tabCounter;
  const closeBtn = document.createElement('span');
  closeBtn.classList.add('close-tab');
  closeBtn.textContent = ' ×';
  newTab.appendChild(closeBtn);
  tabBar.insertBefore(newTab, document.getElementById('add-tab'));

  const newTabContent = document.createElement('div');
  newTabContent.className = 'tab-content';
  newTabContent.setAttribute('data-tab-id', newTabId);

  newTabContent.innerHTML = `
    <div class="spin-the-wheel">
      <div class="wheel-container">
        <canvas class="wheel"></canvas>
        <button class="spin">SPIN</button>
      </div>
        <div class="input-container">
          <button class="clear-chips">×</button>
          <div class="chip-container">
            <input type="text" class="item-input" placeholder="Enter items..." />
          </div>
        </div>
    </div>
  `;
  newTabContent.style.display = 'none';
  tabsContent.appendChild(newTabContent);

  wheelSpinners[newTabId] = new WheelSpinner(newTabContent);

  // Switch to new tab.
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  newTab.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  newTabContent.classList.add('active');
  newTabContent.style.display = 'block';
});

// --- Adding a New Dice Roller Tab ---
document.getElementById('add-dice-tab').addEventListener('click', function () {
  tabCounter++;
  const newTabId = 'tab-' + tabCounter;
  const newTab = document.createElement('div');
  newTab.classList.add('tab');
  newTab.setAttribute('data-tab-id', newTabId);
  newTab.textContent = 'Dice ' + tabCounter;
  const closeBtn = document.createElement('span');
  closeBtn.classList.add('close-tab');
  closeBtn.textContent = ' ×';
  newTab.appendChild(closeBtn);
  tabBar.insertBefore(newTab, document.getElementById('add-dice-tab'));

  const newTabContent = document.createElement('div');
  newTabContent.className = 'tab-content';
  newTabContent.setAttribute('data-tab-id', newTabId);
  // Dice roller markup:
  newTabContent.innerHTML = `
    <div class="dice-roller">
      <div class="dice-controls">
        <label>Dice Count: <input type="number" class="dice-count" value="1" min="1"/></label>
        <label>Sides: <input type="number" class="dice-sides" value="6" min="2"/></label>
        <button class="roll-dice">Roll Dice</button>
      </div>
      <div class="dice-result"></div>
    </div>
  `;
  newTabContent.style.display = 'none';
  tabsContent.appendChild(newTabContent);

  diceRollers[newTabId] = new DiceRoller(newTabContent);

  // Switch to the new dice roller tab.
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  newTab.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  newTabContent.classList.add('active');
  newTabContent.style.display = 'block';
});

// --- Renaming Tabs on Double-Click ---
tabBar.addEventListener('dblclick', function (e) {
  if (e.target.classList.contains('add-tab') || e.target.classList.contains('close-tab')) {
    return;
  }
  if (e.target.classList.contains('tab')) {
    const currentLabel = e.target.childNodes[0].nodeValue.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentLabel;
    input.style.width = '80px';
    while (e.target.firstChild) {
      e.target.removeChild(e.target.firstChild);
    }
    e.target.appendChild(input);
    input.focus();
    input.addEventListener('blur', function () {
      const newLabel = input.value || currentLabel;
      e.target.textContent = newLabel;
      const closeBtn = document.createElement('span');
      closeBtn.classList.add('close-tab');
      closeBtn.textContent = ' ×';
      e.target.appendChild(closeBtn);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        input.blur();
      }
    });
  }
});

// Example: Save the current tabs state to a JSON file.
function saveTabsStateToFile() {
  // Build the state object (similar to your localStorage version)
  let state = {
    tabs: [],
    activeTabId: document.querySelector('.tab.active')
      ? document.querySelector('.tab.active').getAttribute('data-tab-id')
      : null
  };

  // Loop through all non‑add tabs and collect their state.
  const tabHeaders = document.querySelectorAll('.tab:not(.add-tab)');
  tabHeaders.forEach(tab => {
    const tabId = tab.getAttribute('data-tab-id');
    // Get the tab name (text content without the close button)
    const tabName = tab.childNodes[0].nodeValue.trim();
    
    let tabState = { 
      id: tabId,
      name: tabName // Save the tab name
    };
    const tabContent = document.querySelector(`.tab-content[data-tab-id="${tabId}"]`);

    // Determine the tab type by looking for a specific container.
    if (tabContent.querySelector('.spin-the-wheel')) {
      tabState.type = "wheel";
      // Example: if using a chip container
      const chipContainer = tabContent.querySelector('.chip-container');
      if (chipContainer) {
        let chips = [];
        const chipElements = chipContainer.querySelectorAll('.chip');
        chipElements.forEach(chip => {
          chips.push({
            label: chip.dataset.value,         // The chip's text
            multiplier: chip.dataset.multiplier  // The multiplier (if any)
          });
        });
        tabState.items = chips;
      } else {
        // Fallback if using a textarea.
        const textarea = tabContent.querySelector('.item-list');
        if (textarea) {
          tabState.items = textarea.value;
        }
      }
    } else if (tabContent.querySelector('.dice-roller')) {
      tabState.type = "dice";
      tabState.diceCount = tabContent.querySelector('.dice-count').value;
      tabState.diceSides = tabContent.querySelector('.dice-sides').value;
    }

    state.tabs.push(tabState);
  });

  // Convert the state object to a JSON string.
  const jsonString = JSON.stringify(state, null, 2);
  // Create a Blob with MIME type application/json.
  const blob = new Blob([jsonString], { type: 'application/json' });
  // Create a temporary URL for the Blob.
  const url = URL.createObjectURL(blob);
  // Create an anchor element and trigger the download.
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tabs_state.json';
  a.click();
  // Clean up the URL object.
  URL.revokeObjectURL(url);
}

// Example: Load state from a JSON file.
function loadTabsStateFromFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const state = JSON.parse(e.target.result);
      loadTabsStateFromData(state);
    } catch (err) {
      console.error("Error parsing JSON file:", err);
    }
  };
  reader.readAsText(file);
}

// This function re-creates your tabs from a state object.
// It is similar to your loadTabsState() but accepts a state parameter.
function loadTabsStateFromData(state) {
  // Remove existing tabs (except the add buttons)
  document.querySelectorAll('.tab:not(.add-tab)').forEach(tab => tab.remove());
  document.querySelectorAll('.tab-content').forEach(content => content.remove());

  // Reset your global counter if needed.
  tabCounter = 0;

  state.tabs.forEach(tabState => {
    tabCounter++;
    const newTabId = tabState.id; // Use saved id
    let newTab, newTabContent;

    if (tabState.type === "wheel") {
      // Create a new wheel tab header.
      newTab = document.createElement('div');
      newTab.classList.add('tab');
      newTab.setAttribute('data-tab-id', newTabId);
      // Use the saved tab name if available, otherwise use default
      newTab.textContent = tabState.name || ('Wheel ' + tabCounter);
      const closeBtn = document.createElement('span');
      closeBtn.classList.add('close-tab');
      closeBtn.textContent = ' ×';
      newTab.appendChild(closeBtn);
      tabBar.insertBefore(newTab, document.getElementById('add-tab'));

      // Create wheel tab content (use your existing markup)
      newTabContent = document.createElement('div');
      newTabContent.className = 'tab-content';
      newTabContent.setAttribute('data-tab-id', newTabId);
      newTabContent.innerHTML = `
        <div class="spin-the-wheel">
          <div class="wheel-container">
            <canvas class="wheel"></canvas>
            <button class="spin">SPIN</button>
          </div>
          <div class="input-container">
            <button class="clear-chips">×</button>
            <div class="chip-container">
              <input type="text" class="item-input" placeholder="Enter items separated by commas or press Enter" />
            </div>
          </div>
        </div>
      `;
      newTabContent.style.display = 'none';
      tabsContent.appendChild(newTabContent);

      // Instantiate your WheelSpinner for this tab.
      wheelSpinners[newTabId] = new WheelSpinner(newTabContent);

      // Re-create the chips/items.
      if (Array.isArray(tabState.items)) {
        tabState.items.forEach(item => {
          let chipText = item.label;
          if (item.multiplier && Number(item.multiplier) > 1) {
            chipText += ', ' + item.multiplier;
          }
          wheelSpinners[newTabId].addChip(chipText);
        });
        wheelSpinners[newTabId].updateItems();
        wheelSpinners[newTabId].updateWheel();
      } else if (typeof tabState.items === "string") {
        newTabContent.querySelector('.item-list').value = tabState.items;
        wheelSpinners[newTabId].updateItems();
        wheelSpinners[newTabId].updateWheel();
      }
    } else if (tabState.type === "dice") {
      // Create new dice roller tab header.
      newTab = document.createElement('div');
      newTab.classList.add('tab');
      newTab.setAttribute('data-tab-id', newTabId);
      // Use the saved tab name if available, otherwise use default
      newTab.textContent = tabState.name || ('Dice ' + tabCounter);
      const closeBtn = document.createElement('span');
      closeBtn.classList.add('close-tab');
      closeBtn.textContent = ' ×';
      newTab.appendChild(closeBtn);
      tabBar.insertBefore(newTab, document.getElementById('add-dice-tab'));

      // Create dice roller tab content.
      newTabContent = document.createElement('div');
      newTabContent.className = 'tab-content';
      newTabContent.setAttribute('data-tab-id', newTabId);
      newTabContent.innerHTML = `
        <div class="dice-roller">
          <div class="dice-controls">
            <label>Dice Count: <input type="number" class="dice-count" value="1" min="1"/></label>
            <label>Sides: <input type="number" class="dice-sides" value="6" min="2"/></label>
            <button class="roll-dice">Roll Dice</button>
          </div>
          <div class="dice-result"></div>
        </div>
      `;
      newTabContent.style.display = 'none';
      tabsContent.appendChild(newTabContent);

      diceRollers[newTabId] = new DiceRoller(newTabContent);
      newTabContent.querySelector('.dice-count').value = tabState.diceCount;
      newTabContent.querySelector('.dice-sides').value = tabState.diceSides;
    }
  });

  // Activate the saved active tab.
  if (state.activeTabId) {
    const activeTab = document.querySelector(`.tab[data-tab-id="${state.activeTabId}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
      const activeContent = document.querySelector(`.tab-content[data-tab-id="${state.activeTabId}"]`);
      if (activeContent) {
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
      }
    }
  }
}

document.getElementById('save-state').addEventListener('click', saveTabsStateToFile);

document.getElementById('load-state').addEventListener('click', function () {
  document.getElementById('load-state-file').click();
});

document.getElementById('load-state-file').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) {
    loadTabsStateFromFile(file);
  }
});
