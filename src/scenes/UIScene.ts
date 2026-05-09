import Phaser from 'phaser';
import { BUILDING_DEFS, BUILDING_ORDER, type BuildingId } from '../data/buildings';
import { UNIT_DEFS, PLAYER_UNIT_ORDER } from '../data/units';

const HUD_FONT = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '16px',
  color: '#ffffff',
};
const CARD_FONT = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '12px',
  color: '#ffffff',
};

interface ResourceLine {
  key: string;
  capKey: string;
  label: string;
  text: Phaser.GameObjects.Text;
}

const HUD_KEYS = new Set(['wood', 'woodCap', 'stone', 'stoneCap', 'food', 'foodCap', 'pop', 'popCap']);

interface BuildCard {
  id: BuildingId;
  panel: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Sprite;
  text: Phaser.GameObjects.Text;
}

const DRAWER_HEIGHT = 200;
const CARD_W = 96;
const CARD_H = 110;
const CARD_GAP = 8;

export class UIScene extends Phaser.Scene {
  private lines: ResourceLine[] = [];
  private buildButton!: Phaser.GameObjects.Sprite;
  private roadButton!: Phaser.GameObjects.Sprite;
  private roadActive = false;
  private drawer: Phaser.GameObjects.Container | null = null;
  private cards: BuildCard[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const w = this.scale.width;
    this.add.rectangle(0, 0, w, 36, 0x000000, 0.55).setOrigin(0, 0).setDepth(1000);

    const defs: { key: string; capKey: string; label: string }[] = [
      { key: 'wood', capKey: 'woodCap', label: 'W' },
      { key: 'stone', capKey: 'stoneCap', label: 'S' },
      { key: 'food', capKey: 'foodCap', label: 'F' },
      { key: 'pop', capKey: 'popCap', label: 'P' },
    ];

    const colWidth = Math.floor(w / defs.length);
    defs.forEach((d, i) => {
      const text = this.add
        .text(8 + colWidth * i, 8, '', HUD_FONT)
        .setDepth(1001)
        .setScrollFactor(0);
      const line: ResourceLine = { ...d, text };
      this.lines.push(line);
      this.refreshLine(line);
    });

    this.registry.events.on('changedata', this.onRegistryChange, this);

    // BUILD button (bottom-right).
    this.buildButton = this.add
      .sprite(w - 48, this.scale.height - 48, 'build_button')
      .setDepth(1100)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.buildButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.drawer) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    });

    // ROAD button (bottom-right, left of BUILD). Toggles road-paint mode.
    this.roadButton = this.add
      .sprite(w - 48 - 72, this.scale.height - 48, 'road_button')
      .setDepth(1100)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.roadButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.roadActive = !this.roadActive;
      this.roadButton.setTint(this.roadActive ? 0x80ff80 : 0xffffff);
      this.events.emit('road-toggle');
    });

    this.events.on('open-building-panel', this.openBuildingPanel, this);
    this.events.on('close-building-panel', this.closeBuildingPanel, this);
    this.events.on('show-placement-banner', this.showPlacementBanner, this);
    this.events.on('hide-placement-banner', this.hidePlacementBanner, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata', this.onRegistryChange, this);
    });
  }

  // ---------- placement banner ---------------------------------------------

  private placementBanner: Phaser.GameObjects.Container | null = null;

  private showPlacementBanner(name: string): void {
    this.hidePlacementBanner();
    const w = this.scale.width;
    const c = this.add.container(0, 40).setDepth(1300).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, 32, 0x222230, 0.92).setOrigin(0, 0));
    c.add(
      this.add
        .text(12, 7, `Placing: ${name} — tap to place`, { ...HUD_FONT, fontSize: '15px' })
        .setOrigin(0, 0),
    );
    const cancel = this.add
      .text(w - 12, 4, '×', { ...HUD_FONT, fontSize: '24px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    cancel.on(Phaser.Input.Events.POINTER_UP, () => this.events.emit('build-cancel'));
    c.add(cancel);
    this.placementBanner = c;
  }

  private hidePlacementBanner(): void {
    if (!this.placementBanner) return;
    this.placementBanner.destroy();
    this.placementBanner = null;
  }

  // ---------- unified building selection panel ------------------------------

  private buildingPanel: Phaser.GameObjects.Container | null = null;
  private panelBarracksId = -1;

  private openBuildingPanel(payload: {
    instanceId: number;
    id: BuildingId;
    name: string;
    hp: number;
    hpMax: number;
  }): void {
    this.closeBuildingPanel();
    this.panelBarracksId = payload.instanceId;
    const w = this.scale.width;
    const h = this.scale.height;
    const panelH = 130;
    const c = this.add.container(0, h - panelH).setDepth(1200).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, panelH, 0x000000, 0.85).setOrigin(0, 0));
    c.add(
      this.add.text(12, 8, `${payload.name}  HP ${payload.hp}/${payload.hpMax}`, HUD_FONT),
    );
    const close = this.add
      .text(w - 12, 8, '×', { ...HUD_FONT, fontSize: '24px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on(Phaser.Input.Events.POINTER_UP, () => this.closeBuildingPanel());
    c.add(close);

    if (payload.id === 'town_hall') {
      this.fillTownHallPanel(c);
    } else if (payload.id === 'barracks') {
      this.fillBarracksPanel(c);
    } else {
      // Read-only buildings: name + brief function description per §4.4.
      c.add(this.add.text(12, 36, INFO_TEXT[payload.id] ?? '', CARD_FONT));
    }

    this.buildingPanel = c;
  }

  private closeBuildingPanel(): void {
    if (!this.buildingPanel) return;
    this.buildingPanel.destroy();
    this.buildingPanel = null;
    this.panelBarracksId = -1;
  }

  private fillTownHallPanel(c: Phaser.GameObjects.Container): void {
    // §4.3: train Worker (30 food + 20 wood, 10s).
    const x = 12;
    const y = 36;
    const cardW = 160;
    const cardH = 76;
    const panel = this.add
      .rectangle(x, y, cardW, cardH, 0x222230, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x80c0ff)
      .setInteractive({ useHandCursor: true });
    const icon = this.add.sprite(x + 22, y + cardH / 2, 'worker').setOrigin(0.5);
    const tex = this.textures.get('worker').getSourceImage() as { width: number; height: number };
    icon.setScale(Math.min(36 / tex.width, (cardH - 12) / tex.height));
    const text = this.add.text(
      x + 44,
      y + 8,
      `Train Worker\n30F 20W\n10s`,
      CARD_FONT,
    );
    panel.on(Phaser.Input.Events.POINTER_UP, () => this.events.emit('train-worker'));
    c.add(panel);
    c.add(icon);
    c.add(text);
  }

  private fillBarracksPanel(c: Phaser.GameObjects.Container): void {
    const cardW = 96;
    const cardH = 76;
    const gap = 8;
    PLAYER_UNIT_ORDER.forEach((id, idx) => {
      const def = UNIT_DEFS[id];
      const x = 12 + idx * (cardW + gap);
      const y = 36;
      const panel = this.add
        .rectangle(x, y, cardW, cardH, 0x222230, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x80c0ff)
        .setInteractive({ useHandCursor: true });
      const icon = this.add.sprite(x + 22, y + cardH / 2, def.textureKey).setOrigin(0.5);
      const tex = this.textures.get(def.textureKey).getSourceImage() as {
        width: number;
        height: number;
      };
      icon.setScale(Math.min(36 / tex.width, (cardH - 12) / tex.height));
      const text = this.add.text(
        x + 44,
        y + 8,
        `${def.name}\n${formatUnitCost(def)}\n${def.trainTimeSec}s`,
        CARD_FONT,
      );
      panel.on(Phaser.Input.Events.POINTER_UP, () => {
        this.events.emit('train-unit', { id, barracksId: this.panelBarracksId });
      });
      c.add(panel);
      c.add(icon);
      c.add(text);
    });
  }

  private onRegistryChange(_parent: unknown, key: string): void {
    if (HUD_KEYS.has(key)) {
      for (const line of this.lines) {
        if (key === line.key || key === line.capKey) {
          this.refreshLine(line);
        }
      }
    }
    if (this.drawer && (key === 'wood' || key === 'stone' || key === 'food' || key === 'builtIds')) {
      this.refreshCards();
    }
  }

  private refreshLine(line: ResourceLine): void {
    const value = (this.registry.get(line.key) as number) ?? 0;
    const cap = (this.registry.get(line.capKey) as number) ?? 0;
    line.text.setText(`${line.label} ${value}/${cap}`);
  }

  private openDrawer(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.drawer = this.add.container(0, h - DRAWER_HEIGHT).setDepth(1200).setScrollFactor(0);

    const bg = this.add.rectangle(0, 0, w, DRAWER_HEIGHT, 0x000000, 0.85).setOrigin(0, 0);
    this.drawer.add(bg);

    const header = this.add.text(12, 8, 'BUILD', HUD_FONT);
    this.drawer.add(header);

    const closeBtn = this.add
      .text(w - 12, 8, '×', { ...HUD_FONT, fontSize: '24px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    closeBtn.on(Phaser.Input.Events.POINTER_UP, () => this.closeDrawer());
    this.drawer.add(closeBtn);

    // Horizontally scrollable strip — Phase 3 keeps it static and lays cards
    // in one row; the drawer is wider than the screen so users pan with a
    // future swipe. For now we lay them out and clip with the drawer rect.
    const startX = 12;
    const startY = 36;
    BUILDING_ORDER.forEach((id, idx) => {
      const x = startX + idx * (CARD_W + CARD_GAP);
      this.cards.push(this.makeCard(id, x, startY));
    });

    this.refreshCards();
  }

  private closeDrawer(): void {
    if (!this.drawer) return;
    this.dismissDrawer();
    // Manual close (× button or BUILD-toggle): cancel any in-flight placement.
    this.events.emit('build-cancel');
  }

  // Quiet drawer teardown for when the user picked a card. closeDrawer's
  // build-cancel emit would race-destroy the placement we just created.
  private dismissDrawer(): void {
    if (!this.drawer) return;
    this.drawer.destroy();
    this.drawer = null;
    this.cards = [];
  }

  private makeCard(id: BuildingId, x: number, y: number): BuildCard {
    const def = BUILDING_DEFS[id];
    const panel = this.add
      .rectangle(x, y, CARD_W, CARD_H, 0x222230, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x556070)
      .setInteractive({ useHandCursor: true });
    this.drawer!.add(panel);

    // Scale the building sprite into the card icon area, preserving aspect.
    const iconAreaW = CARD_W - 12;
    const iconAreaH = 56;
    const icon = this.add.sprite(x + CARD_W / 2, y + 8 + iconAreaH / 2, `b_${id}`).setOrigin(0.5);
    const tex = this.textures.get(`b_${id}`).getSourceImage() as { width: number; height: number };
    const scale = Math.min(iconAreaW / tex.width, iconAreaH / tex.height);
    icon.setScale(scale);
    this.drawer!.add(icon);

    const costStr = formatCost(def);
    const text = this.add
      .text(x + 6, y + iconAreaH + 16, `${def.name}\n${costStr}`, CARD_FONT)
      .setLineSpacing(2);
    this.drawer!.add(text);

    const card: BuildCard = { id, panel, icon, text };
    panel.on(Phaser.Input.Events.POINTER_UP, () => {
      if (panel.getData('locked')) return;
      this.events.emit('build-card-selected', id);
      // dismissDrawer (NOT closeDrawer) so we don't emit build-cancel and
      // immediately tear down the placement we just created.
      this.dismissDrawer();
    });

    return card;
  }

  private refreshCards(): void {
    const built = this.registry.get('builtIds') as Set<BuildingId> | undefined;
    for (const c of this.cards) {
      const def = BUILDING_DEFS[c.id];
      const prereqOk =
        (!def.prereqs || def.prereqs.every((p) => built?.has(p))) &&
        (!def.prereqsAny || def.prereqsAny.some((p) => built?.has(p)));
      const wood = (this.registry.get('wood') as number) ?? 0;
      const stone = (this.registry.get('stone') as number) ?? 0;
      const food = (this.registry.get('food') as number) ?? 0;
      const affordOk =
        (def.cost.wood ?? 0) <= wood &&
        (def.cost.stone ?? 0) <= stone &&
        (def.cost.food ?? 0) <= food;
      const locked = !prereqOk;
      const dim = !affordOk;
      c.panel.setData('locked', locked);
      c.panel.setStrokeStyle(2, locked ? 0xaa3030 : dim ? 0x55556a : 0x80c0ff);
      c.panel.setFillStyle(locked ? 0x331818 : 0x222230, 1);
      c.icon.setAlpha(locked ? 0.35 : dim ? 0.6 : 1);
      c.text.setAlpha(locked ? 0.6 : 1);
    }
  }
}

function formatCost(def: { cost: Partial<Record<'wood' | 'stone' | 'food', number>> }): string {
  const parts: string[] = [];
  if (def.cost.wood) parts.push(`${def.cost.wood}W`);
  if (def.cost.stone) parts.push(`${def.cost.stone}S`);
  if (def.cost.food) parts.push(`${def.cost.food}F`);
  return parts.join(' ');
}

function formatUnitCost(def: { cost?: Partial<Record<'wood' | 'stone' | 'food', number>> }): string {
  if (!def.cost) return '';
  return formatCost({ cost: def.cost });
}

// One-liner descriptions for the read-only branch of the building panel.
// Sourced from §4.4 functions; tweak the wording as we localise.
const INFO_TEXT: Partial<Record<BuildingId, string>> = {
  house: '+3 population cap.',
  lumber_mill: '+50% wood when workers deposit here.',
  quarry: '+50% stone when workers deposit here.',
  farm: 'Generates 1 food every 5 seconds, no worker needed.',
  hunters_lodge: '+30% food when workers deposit animal kills here.',
  warehouse: '+200 wood, +150 stone, +200 food storage cap.',
  wall: 'Blocks bandit movement.',
  tower: 'Auto-attacks bandits within 5 tiles (Phase 5).',
};
