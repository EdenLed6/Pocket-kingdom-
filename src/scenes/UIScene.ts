import Phaser from 'phaser';
import { BUILDING_DEFS, BUILDING_ORDER, type BuildingId } from '../data/buildings';
import { UNIT_DEFS, PLAYER_UNIT_ORDER } from '../data/units';
import type { Worker } from '../entities/Worker';
import { AudioSystem } from '../systems/AudioSystem';
import { TechSystem } from '../systems/TechSystem';
import { TECH_DEFS, TECH_ORDER, type TechId } from '../data/tech';
import type { ResourceType } from '../data/balance';

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

// 2×5 grid: 9 buildings + 1 empty slot. Sized to fit a 540-wide canvas.
const DRAWER_HEIGHT = 296;
const CARD_W = 96;
const CARD_H = 110;
const CARD_GAP = 8;
const CARD_COLS = 5;

export class UIScene extends Phaser.Scene {
  private lines: ResourceLine[] = [];
  private buildButton!: Phaser.GameObjects.Sprite;
  private roadButton!: Phaser.GameObjects.Sprite;
  private paintModeLabel: Phaser.GameObjects.Text | null = null;
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

    // Reserve 36 px on the right for the pause button so the resource
    // text doesn't run under it.
    const usable = w - 36;
    const colWidth = Math.floor(usable / defs.length);
    defs.forEach((d, i) => {
      const text = this.add
        .text(8 + colWidth * i, 8, '', HUD_FONT)
        .setDepth(1001)
        .setScrollFactor(0);
      const line: ResourceLine = { ...d, text };
      this.lines.push(line);
      this.refreshLine(line);
    });

    // Pause button — hamburger glyph at top-right of the HUD bar.
    const pauseBtn = this.add
      .text(w - 18, 18, '☰', { ...HUD_FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(1010)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    pauseBtn.on(Phaser.Input.Events.POINTER_UP, () => {
      AudioSystem.play('button_tap');
      this.showPauseMenu();
    });

    this.registry.events.on('changedata', this.onRegistryChange, this);

    // BUILD button (bottom-right).
    this.buildButton = this.add
      .sprite(w - 48, this.scale.height - 48, 'build_button')
      .setDepth(1100)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.buildButton.on(Phaser.Input.Events.POINTER_UP, () => {
      AudioSystem.play('button_tap');
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
      AudioSystem.play('button_tap');
      this.events.emit('road-toggle');
    });
    this.events.on('paint-mode-changed', this.onPaintModeChanged, this);

    this.events.on('raid-warning', this.showRaidWarning, this);
    this.events.on('raid-warning-end', this.hideRaidWarning, this);
    this.events.on('game-over', this.showGameOver, this);
    this.events.on('open-building-panel', this.openBuildingPanel, this);
    this.events.on('close-building-panel', this.closeBuildingPanel, this);
    this.events.on('open-worker-panel', this.openWorkerPanel, this);
    this.events.on('close-worker-panel', this.closeWorkerPanel, this);
    this.events.on('show-placement-banner', this.showPlacementBanner, this);
    this.events.on('hide-placement-banner', this.hidePlacementBanner, this);
    this.events.on('saved-toast', this.showSavedToast, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata', this.onRegistryChange, this);
    });
  }

  // ---------- worker selection panel ---------------------------------------

  private workerPanel: Phaser.GameObjects.Container | null = null;
  private workerPanelWorker: Worker | null = null;
  private workerPanelStateText: Phaser.GameObjects.Text | null = null;
  private workerPanelTimer: Phaser.Time.TimerEvent | null = null;

  private openWorkerPanel(payload: { worker: Worker }): void {
    this.closeWorkerPanel();
    this.workerPanelWorker = payload.worker;
    const w = this.scale.width;
    const h = this.scale.height;
    const panelH = 92;
    const c = this.add.container(0, h - panelH).setDepth(1200).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, panelH, 0x000000, 0.85).setOrigin(0, 0));
    c.add(this.add.text(12, 8, `Worker #${payload.worker.id + 1}`, HUD_FONT));
    this.workerPanelStateText = this.add.text(
      12,
      32,
      payload.worker.getStatusText(),
      { ...HUD_FONT, fontSize: '14px', color: '#cce0ff' },
    );
    c.add(this.workerPanelStateText);

    // Send-home button.
    const btnW = 130;
    const btnH = 36;
    const btnX = w - btnW - 12;
    const btnY = panelH / 2 - btnH / 2;
    const btn = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0x3a4a6a, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x80c0ff)
      .setInteractive({ useHandCursor: true });
    const btnLabel = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, 'Send home', { ...HUD_FONT, fontSize: '14px' })
      .setOrigin(0.5);
    btn.on(Phaser.Input.Events.POINTER_UP, () => {
      const w2 = this.workerPanelWorker;
      if (w2) w2.sendHome();
    });
    c.add(btn);
    c.add(btnLabel);

    // Close ×.
    const close = this.add
      .text(w - 12, 4, '×', { ...HUD_FONT, fontSize: '24px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on(Phaser.Input.Events.POINTER_UP, () => this.closeWorkerPanel());
    c.add(close);

    // Refresh status text twice a second so the player sees state changes.
    this.workerPanelTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.workerPanelStateText && this.workerPanelWorker) {
          this.workerPanelStateText.setText(this.workerPanelWorker.getStatusText());
        }
      },
    });

    this.workerPanel = c;
  }

  private closeWorkerPanel(): void {
    if (!this.workerPanel) return;
    this.workerPanel.destroy();
    this.workerPanel = null;
    this.workerPanelWorker = null;
    this.workerPanelStateText = null;
    if (this.workerPanelTimer) {
      this.workerPanelTimer.remove();
      this.workerPanelTimer = null;
    }
  }

  // ---------- placement banner ---------------------------------------------

  // ---------- pause menu (§7.6) -----------------------------------------

  private pausePanel: Phaser.GameObjects.Container | null = null;
  private settingsPanel: Phaser.GameObjects.Container | null = null;

  private showPauseMenu(): void {
    if (this.pausePanel || this.gameOverPanel) return;
    // Drop transient UI so the overlay reads as the only thing on screen.
    this.dismissDrawer();
    this.hidePlacementBanner();
    this.closeWorkerPanel();
    this.closeBuildingPanel();

    const game = this.scene.get('Game');
    if (!game.scene.isPaused()) game.scene.pause();

    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(1900).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.78).setOrigin(0, 0));
    c.add(
      this.add
        .text(w / 2, h * 0.22, 'Paused', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '24px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    const items: { label: string; disabled?: boolean; onTap: () => void }[] = [
      { label: 'Resume', onTap: () => this.hidePauseMenu() },
      {
        label: 'Save',
        onTap: () => {
          this.events.emit('save-now');
          this.flashPauseToast('Saved.');
        },
      },
      {
        label: 'Load',
        onTap: () => this.events.emit('load-game'),
      },
      { label: 'Settings', onTap: () => this.showSettings() },
      { label: 'Quit', onTap: () => window.location.reload() },
    ];

    const btnW = 220;
    const btnH = 48;
    const startY = h * 0.32;
    items.forEach((item, i) => {
      const x = w / 2 - btnW / 2;
      const y = startY + i * (btnH + 10);
      const fill = item.disabled ? 0x222230 : 0x3a4a6a;
      const stroke = item.disabled ? 0x444454 : 0x80c0ff;
      const rect = this.add
        .rectangle(x, y, btnW, btnH, fill, 1)
        .setOrigin(0, 0)
        .setStrokeStyle(2, stroke);
      const label = this.add
        .text(x + btnW / 2, y + btnH / 2, item.label, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '16px',
          color: item.disabled ? '#777777' : '#ffffff',
        })
        .setOrigin(0.5);
      if (!item.disabled) {
        rect.setInteractive({ useHandCursor: true });
        rect.on(Phaser.Input.Events.POINTER_UP, item.onTap);
      }
      c.add(rect);
      c.add(label);
    });

    this.pausePanel = c;
  }

  private hidePauseMenu(): void {
    if (this.settingsPanel) this.hideSettings();
    if (!this.pausePanel) return;
    this.pausePanel.destroy();
    this.pausePanel = null;
    const game = this.scene.get('Game');
    if (game.scene.isPaused() && !this.gameOverPanel) game.scene.resume();
  }

  // Ephemeral toast over the pause overlay (e.g. "Saved.").
  private flashPauseToast(text: string): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const t = this.add
      .text(w / 2, h * 0.84, text, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#a8ffa8',
        backgroundColor: 'rgba(0,0,0,0.65)',
        padding: { left: 10, right: 10, top: 5, bottom: 5 },
      })
      .setOrigin(0.5)
      .setDepth(1960)
      .setScrollFactor(0);
    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      delay: 900,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  private showSettings(): void {
    if (this.settingsPanel) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(1950).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.85).setOrigin(0, 0));
    c.add(
      this.add
        .text(w / 2, h * 0.18, 'Settings', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '22px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
    // Phase 6c: working volume sliders bound to AudioSystem. Two channels
    // (master + SFX) — no music slider because BGM is intentionally not
    // shipped in 6c.
    const audioCfg: { label: string; get: () => number; set: (v: number) => void }[] = [
      {
        label: 'Master volume',
        get: () => AudioSystem.getSettings().master,
        set: (v) => AudioSystem.setMasterVolume(v),
      },
      {
        label: 'SFX volume',
        get: () => AudioSystem.getSettings().sfx,
        set: (v) => {
          AudioSystem.setSfxVolume(v);
          AudioSystem.play('button_tap'); // audible preview while dragging
        },
      },
    ];
    audioCfg.forEach((cfg, i) => {
      const y = h * 0.3 + i * 64;
      const trackX = w / 2 - 100;
      const trackW = 200;
      c.add(
        this.add
          .text(trackX, y, cfg.label, {
            fontFamily: 'ui-monospace, monospace',
            fontSize: '14px',
            color: '#cccccc',
          })
          .setOrigin(0, 0.5),
      );
      const track = this.add
        .rectangle(trackX, y + 24, trackW, 4, 0x444454, 1)
        .setOrigin(0, 0.5);
      c.add(track);
      const handle = this.add
        .circle(trackX + trackW * cfg.get(), y + 24, 9, 0x80c0ff, 1)
        .setStrokeStyle(1, 0xffffff)
        .setInteractive({ useHandCursor: true, draggable: true });
      c.add(handle);
      // Hit-area for taps (wider than the handle so finger taps work).
      const hit = this.add
        .rectangle(trackX, y + 24, trackW, 28, 0xffffff, 0)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      c.add(hit);
      const apply = (px: number) => {
        const ratio = Math.max(0, Math.min(1, (px - trackX) / trackW));
        handle.x = trackX + trackW * ratio;
        cfg.set(ratio);
      };
      hit.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        apply(pointer.x);
      });
      handle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
        apply(dragX);
      });
    });

    // "Reset Progress" — clears localStorage save then reloads.
    const resetY = h * 0.62;
    const rrW = 220;
    const rrH = 40;
    const rrX = w / 2 - rrW / 2;
    const reset = this.add
      .rectangle(rrX, resetY, rrW, rrH, 0x4a1a1a, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xc06060)
      .setInteractive({ useHandCursor: true });
    const resetLabel = this.add
      .text(rrX + rrW / 2, resetY + rrH / 2, 'Reset Progress', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: '#ffd0d0',
      })
      .setOrigin(0.5);
    reset.on(Phaser.Input.Events.POINTER_UP, () => this.events.emit('reset-progress'));
    c.add(reset);
    c.add(resetLabel);

    // Back button.
    const backY = h * 0.78;
    const bbW = 160;
    const bbH = 44;
    const bbX = w / 2 - bbW / 2;
    const back = this.add
      .rectangle(bbX, backY, bbW, bbH, 0x3a4a6a, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x80c0ff)
      .setInteractive({ useHandCursor: true });
    const backLabel = this.add
      .text(bbX + bbW / 2, backY + bbH / 2, 'Back', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    back.on(Phaser.Input.Events.POINTER_UP, () => this.hideSettings());
    c.add(back);
    c.add(backLabel);

    this.settingsPanel = c;
  }

  private hideSettings(): void {
    if (!this.settingsPanel) return;
    this.settingsPanel.destroy();
    this.settingsPanel = null;
  }

  // ---------- game over overlay ----------------------------------------

  private gameOverPanel: Phaser.GameObjects.Container | null = null;

  private showGameOver(): void {
    if (this.gameOverPanel) return;
    // Drop any other transient UI so the overlay is clean.
    this.hideRaidWarning();
    this.hidePlacementBanner();
    this.dismissDrawer();

    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, h, 0x000000, 0.85).setOrigin(0, 0));
    c.add(
      this.add
        .text(w / 2, h * 0.4, 'Your village has fallen', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '22px',
          color: '#ff8080',
          align: 'center',
        })
        .setOrigin(0.5),
    );

    const btnW = 180;
    const btnH = 56;
    const btnX = w / 2 - btnW / 2;
    const btnY = h * 0.55;
    const btn = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0x3a4a6a, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x80c0ff)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, 'Restart', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    btn.on(Phaser.Input.Events.POINTER_UP, () => this.restartGame());
    c.add(btn);
    c.add(label);

    this.gameOverPanel = c;
  }

  private restartGame(): void {
    // Tear down the overlay first, then bounce both scenes. GameScene
    // was paused by the game-over emit; UIScene needs to clear its own
    // state so a fresh game starts clean.
    if (this.gameOverPanel) {
      this.gameOverPanel.destroy();
      this.gameOverPanel = null;
    }
    const game = this.scene.get('Game');
    if (game.scene.isPaused()) game.scene.resume();
    game.scene.restart();
    this.scene.restart();
  }

  // ---------- raid warning (10s pre-spawn banner + arrow) ----------------

  private raidBanner: Phaser.GameObjects.Container | null = null;
  private raidBannerText: Phaser.GameObjects.Text | null = null;
  private raidArrow: Phaser.GameObjects.Container | null = null;
  private raidCountdownLeft = 0;
  private raidCountdownTimer: Phaser.Time.TimerEvent | null = null;

  private showRaidWarning(payload: {
    side: 'top' | 'bottom' | 'left' | 'right';
    count: number;
    leadSec: number;
  }): void {
    this.hideRaidWarning();
    const w = this.scale.width;
    const h = this.scale.height;
    const bannerH = 48;

    // Banner: top-of-screen red strip with the countdown.
    const c = this.add.container(0, 38).setDepth(1300).setScrollFactor(0);
    c.add(this.add.rectangle(0, 0, w, bannerH, 0x6a0a0a, 0.92).setOrigin(0, 0));
    c.add(
      this.add
        .rectangle(0, 0, w, bannerH, 0xff4040, 0)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0xff8080),
    );
    const text = this.add
      .text(w / 2, bannerH / 2, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '15px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    c.add(text);
    this.raidBanner = c;
    this.raidBannerText = text;
    this.raidCountdownLeft = payload.leadSec;
    this.refreshRaidBannerText(payload.count);

    // Pulsing red border on the banner so it grabs attention.
    this.tweens.add({
      targets: c.list[1],
      alpha: { from: 0, to: 0.55 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Directional arrow at the screen edge the bandits will come from.
    this.raidArrow = this.makeRaidArrow(payload.side, w, h);

    // Tick the countdown once a second.
    this.raidCountdownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.raidCountdownLeft = Math.max(0, this.raidCountdownLeft - 1);
        this.refreshRaidBannerText(payload.count);
      },
    });
  }

  private refreshRaidBannerText(count: number): void {
    if (!this.raidBannerText) return;
    const t = this.raidCountdownLeft;
    const mm = Math.floor(t / 60).toString().padStart(1, '0');
    const ss = (t % 60).toString().padStart(2, '0');
    this.raidBannerText.setText(`! RAID INCOMING — ${count} bandits — ${mm}:${ss}`);
  }

  private makeRaidArrow(
    side: 'top' | 'bottom' | 'left' | 'right',
    w: number,
    h: number,
  ): Phaser.GameObjects.Container {
    // Arrow positioned just inside the relevant viewport edge, pointing
    // outward toward where the bandits are coming from.
    const c = this.add.container(0, 0).setDepth(1305).setScrollFactor(0);
    const triSize = 24;
    let x = w / 2;
    let y = h / 2;
    let rot = 0;
    if (side === 'top') {
      x = w / 2;
      y = 100;
      rot = 0;
    } else if (side === 'bottom') {
      x = w / 2;
      y = h - 80;
      rot = Math.PI;
    } else if (side === 'left') {
      x = 40;
      y = h / 2;
      rot = -Math.PI / 2;
    } else {
      x = w - 40;
      y = h / 2;
      rot = Math.PI / 2;
    }
    const tri = this.add
      .triangle(0, 0, 0, triSize, triSize, triSize, triSize / 2, 0, 0xff4040)
      .setStrokeStyle(2, 0xffffff);
    c.setPosition(x, y);
    c.add(tri);
    tri.setRotation(rot);

    // Bob the arrow toward the edge so it reads as "they're coming".
    const dx = side === 'left' ? -8 : side === 'right' ? 8 : 0;
    const dy = side === 'top' ? -8 : side === 'bottom' ? 8 : 0;
    this.tweens.add({
      targets: c,
      x: x + dx,
      y: y + dy,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });
    return c;
  }

  private hideRaidWarning(): void {
    if (this.raidCountdownTimer) {
      this.raidCountdownTimer.remove();
      this.raidCountdownTimer = null;
    }
    if (this.raidBanner) {
      this.tweens.killTweensOf(this.raidBanner.list);
      this.raidBanner.destroy();
      this.raidBanner = null;
    }
    if (this.raidArrow) {
      this.tweens.killTweensOf(this.raidArrow);
      this.raidArrow.destroy();
      this.raidArrow = null;
    }
    this.raidBannerText = null;
    this.raidCountdownLeft = 0;
  }

  // ---------- placement banner (mid-build ghost label) ----------------

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

  // Brief top-right chip that fades in/out, used for both manual saves and
  // the 30s autosave tick so the player knows their progress is durable.
  private savedToast: Phaser.GameObjects.Container | null = null;
  private showSavedToast(label: string): void {
    if (this.savedToast) {
      this.savedToast.destroy();
      this.savedToast = null;
    }
    const w = this.scale.width;
    const text = this.add.text(0, 0, label, { ...HUD_FONT, fontSize: '13px' }).setOrigin(0, 0);
    const padX = 10;
    const padY = 6;
    const bg = this.add
      .rectangle(0, 0, text.width + padX * 2, text.height + padY * 2, 0x222230, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x80c080);
    text.setPosition(padX, padY);
    const c = this.add
      .container(w - bg.width - 12, 80, [bg, text])
      .setDepth(1400)
      .setScrollFactor(0)
      .setAlpha(0);
    this.savedToast = c;
    this.tweens.add({
      targets: c,
      alpha: 1,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: c,
          alpha: 0,
          delay: 1200,
          duration: 320,
          onComplete: () => {
            if (this.savedToast === c) this.savedToast = null;
            c.destroy();
          },
        });
      },
    });
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
    panel.on(Phaser.Input.Events.POINTER_UP, () => {
      AudioSystem.play('button_tap');
      this.events.emit('train-worker');
    });
    c.add(panel);
    c.add(icon);
    c.add(text);

    // Research button to the right of the Train Worker card. Opens a
    // research modal panel listing all techs with their costs.
    const rx = x + cardW + 10;
    const research = this.add
      .rectangle(rx, y, 90, cardH, 0x222230, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffd060)
      .setInteractive({ useHandCursor: true });
    const rText = this.add.text(rx + 45, y + cardH / 2, 'Research', {
      ...CARD_FONT,
      align: 'center',
    }).setOrigin(0.5);
    research.on(Phaser.Input.Events.POINTER_UP, () => {
      AudioSystem.play('button_tap');
      this.openResearchPanel();
    });
    c.add(research);
    c.add(rText);
  }

  private researchPanel: Phaser.GameObjects.Container | null = null;
  private openResearchPanel(): void {
    if (this.researchPanel) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);
    c.add(
      this.add
        .rectangle(0, 0, w, h, 0x000000, 0.55)
        .setOrigin(0, 0)
        .setInteractive(),
    );
    const panelW = Math.min(w - 32, 480);
    const panelH = Math.min(h - 80, 600);
    const px = (w - panelW) / 2;
    const py = (h - panelH) / 2;
    c.add(
      this.add
        .rectangle(px, py, panelW, panelH, 0x1a1a24, 0.98)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0xffd060),
    );
    c.add(
      this.add
        .text(px + 16, py + 12, 'Research', { ...HUD_FONT, fontSize: '20px' }),
    );
    const close = this.add
      .text(px + panelW - 16, py + 8, '×', { ...HUD_FONT, fontSize: '28px' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    close.on(Phaser.Input.Events.POINTER_UP, () => this.closeResearchPanel());
    c.add(close);

    const cardH = 70;
    const gap = 8;
    TECH_ORDER.forEach((id, i) => {
      const cy = py + 50 + i * (cardH + gap);
      const card = this.makeTechCard(px + 12, cy, panelW - 24, cardH, id);
      c.add(card);
    });

    this.researchPanel = c;
    // Listen for unlocks so the open panel reflects the new state. We
    // register on `.on` (not `.once`) so a single subscription survives
    // multiple unlocks; closeResearchPanel removes it.
    this.events.on('tech-unlocked', this.refreshResearchPanel, this);
  }

  private refreshResearchPanel(): void {
    if (!this.researchPanel) return;
    this.closeResearchPanel();
    this.openResearchPanel();
  }

  private closeResearchPanel(): void {
    if (!this.researchPanel) return;
    this.events.off('tech-unlocked', this.refreshResearchPanel, this);
    this.researchPanel.destroy();
    this.researchPanel = null;
  }

  private makeTechCard(
    x: number, y: number, w: number, h: number, id: TechId,
  ): Phaser.GameObjects.Container {
    const def = TECH_DEFS[id];
    const unlocked = TechSystem.has(id);
    const card = this.add.container(0, 0);
    const affordable = this.canAfford(def.cost);
    const prereqOk = !def.requiresBuilding || this.hasConstructed(def.requiresBuilding);
    const enabled = !unlocked && affordable && prereqOk;
    const stroke = unlocked ? 0x60c060 : enabled ? 0xffd060 : 0x444454;
    const bg = this.add
      .rectangle(x, y, w, h, 0x222230, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, stroke);
    if (enabled) bg.setInteractive({ useHandCursor: true });
    card.add(bg);
    card.add(this.add.text(x + 12, y + 8, def.name, { ...HUD_FONT, fontSize: '15px' }));
    card.add(
      this.add.text(x + 12, y + 28, def.description, { ...CARD_FONT, color: '#cfcfcf' }),
    );
    const costText = unlocked
      ? 'Researched ✓'
      : Object.entries(def.cost)
          .map(([r, n]) => `${n}${r[0].toUpperCase()}`)
          .join(' ') + (prereqOk ? '' : `  (req: ${def.requiresBuilding})`);
    card.add(
      this.add
        .text(x + w - 12, y + h - 8, costText, {
          ...CARD_FONT,
          color: unlocked ? '#80c080' : enabled ? '#ffd060' : '#888888',
        })
        .setOrigin(1, 1),
    );
    if (enabled) {
      bg.on(Phaser.Input.Events.POINTER_UP, () => {
        AudioSystem.play('button_tap');
        this.events.emit('tech-unlock-request', { id });
      });
    }
    return card;
  }

  private canAfford(cost: Partial<Record<ResourceType, number>>): boolean {
    // GameScene keys resources by their bare name in the registry.
    for (const [r, amt] of Object.entries(cost) as [ResourceType, number][]) {
      const cur = (this.registry.get(r) as number) ?? 0;
      if (cur < amt) return false;
    }
    return true;
  }

  private hasConstructed(_id: string): boolean {
    // UIScene doesn't track buildings directly; we ask the registry, which
    // GameScene maintains as 'builtIds' (buildings whose construction has
    // ever completed during this run).
    const built = this.registry.get('builtIds') as Set<string> | undefined;
    return built ? built.has(_id) : false;
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

    // 2×5 grid centred horizontally so all 9 cards are reachable without
    // off-screen scrolling.
    const totalRowWidth = CARD_COLS * CARD_W + (CARD_COLS - 1) * CARD_GAP;
    const startX = Math.max(8, Math.floor((w - totalRowWidth) / 2));
    const startY = 36;
    BUILDING_ORDER.forEach((id, idx) => {
      const col = idx % CARD_COLS;
      const row = Math.floor(idx / CARD_COLS);
      const x = startX + col * (CARD_W + CARD_GAP);
      const y = startY + row * (CARD_H + CARD_GAP);
      this.cards.push(this.makeCard(id, x, y));
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
  private onPaintModeChanged(mode: 'off' | 'road' | 'water'): void {
    // Tint the road button to signal the active mode and show a label so
    // the player knows what tapping will paint.
    if (mode === 'off') {
      this.roadButton.clearTint();
    } else if (mode === 'road') {
      this.roadButton.setTint(0xa07040); // dirt brown
    } else {
      this.roadButton.setTint(0x60a0e0); // water blue
    }
    if (this.paintModeLabel) {
      this.paintModeLabel.destroy();
      this.paintModeLabel = null;
    }
    if (mode !== 'off') {
      this.paintModeLabel = this.add
        .text(this.scale.width / 2, this.scale.height - 16, mode === 'road' ? 'PAINT: ROAD' : 'DIG: WATER', {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '14px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: { left: 8, right: 8, top: 4, bottom: 4 },
        })
        .setOrigin(0.5, 1)
        .setDepth(1100)
        .setScrollFactor(0);
    }
  }

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
      AudioSystem.play('button_tap');
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
      c.panel.setData('locked', locked || dim);
      c.panel.setStrokeStyle(2, locked ? 0xaa3030 : dim ? 0x666666 : 0x80c0ff);
      c.panel.setFillStyle(locked ? 0x331818 : dim ? 0x202028 : 0x222230, 1);
      c.icon.setAlpha(locked || dim ? 0.55 : 1);
      // Gray tint for unaffordable so it's clearly "off". Locked cards keep
      // the dim alpha but no tint (red border conveys lock state).
      if (dim && !locked) c.icon.setTint(0x808080);
      else c.icon.clearTint();
      c.text.setAlpha(locked ? 0.55 : dim ? 0.6 : 1);
      c.text.setColor(dim && !locked ? '#aaaaaa' : '#ffffff');
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
