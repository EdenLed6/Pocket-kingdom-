import Phaser from 'phaser';

export interface TouchControllerOpts {
  minZoom: number;
  maxZoom: number;
  // §7.5: distinguish tap vs drag using a 10 px / 200 ms threshold so future
  // tap-to-select doesn't fire on the start of a pan.
  dragStartThresholdPx?: number;
}

// One-finger pan + two-finger pinch zoom on the scene's main camera.
// Camera bounds (set by GameScene) clamp scrolling; we just translate scroll.
export class TouchController {
  private readonly scene: Phaser.Scene;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly dragThreshold: number;

  // Pan state (single pointer).
  private isPanning = false;
  private panExceededThreshold = false;
  private panDownX = 0;
  private panDownY = 0;
  private panLastX = 0;
  private panLastY = 0;

  // Pinch state (two pointers).
  private isPinching = false;
  private pinchPrevDist = 0;

  // For desktop dev: mouse wheel zoom.
  private readonly wheelZoomStep = 0.1;

  constructor(scene: Phaser.Scene, opts: TouchControllerOpts) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.minZoom = opts.minZoom;
    this.maxZoom = opts.maxZoom;
    this.dragThreshold = opts.dragStartThresholdPx ?? 10;

    // Default pointer count is 2; explicitly ensure at least 2 for pinch.
    scene.input.addPointer(1);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    scene.input.on('wheel', this.onWheel, this);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private activeTouchPointers(): Phaser.Input.Pointer[] {
    const out: Phaser.Input.Pointer[] = [];
    for (let i = 1; i <= 10; i++) {
      const p = (this.scene.input as unknown as Record<string, Phaser.Input.Pointer | undefined>)[
        `pointer${i}`
      ];
      if (p && p.isDown) out.push(p);
    }
    return out;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const active = this.activeTouchPointers();
    if (active.length >= 2) {
      // Promote to pinch; cancel any in-progress pan.
      this.isPanning = false;
      this.panExceededThreshold = false;
      this.isPinching = true;
      this.pinchPrevDist = Phaser.Math.Distance.Between(
        active[0].x,
        active[0].y,
        active[1].x,
        active[1].y,
      );
      return;
    }

    this.isPanning = true;
    this.panExceededThreshold = false;
    this.panDownX = pointer.x;
    this.panDownY = pointer.y;
    this.panLastX = pointer.x;
    this.panLastY = pointer.y;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isPinching) {
      const active = this.activeTouchPointers();
      if (active.length < 2) return;
      const dist = Phaser.Math.Distance.Between(
        active[0].x,
        active[0].y,
        active[1].x,
        active[1].y,
      );
      if (this.pinchPrevDist > 0 && dist > 0) {
        // Zoom around the midpoint between the two fingers so the world
        // doesn't shoot off when you pinch in a corner.
        const ratio = dist / this.pinchPrevDist;
        const newZoom = Phaser.Math.Clamp(this.cam.zoom * ratio, this.minZoom, this.maxZoom);
        const midScreenX = (active[0].x + active[1].x) * 0.5;
        const midScreenY = (active[0].y + active[1].y) * 0.5;
        this.zoomAround(midScreenX, midScreenY, newZoom);
      }
      this.pinchPrevDist = dist;
      return;
    }

    if (!this.isPanning || !pointer.isDown) return;

    if (!this.panExceededThreshold) {
      const dx = pointer.x - this.panDownX;
      const dy = pointer.y - this.panDownY;
      if (dx * dx + dy * dy < this.dragThreshold * this.dragThreshold) return;
      this.panExceededThreshold = true;
    }

    const stepX = pointer.x - this.panLastX;
    const stepY = pointer.y - this.panLastY;
    this.panLastX = pointer.x;
    this.panLastY = pointer.y;

    // Screen-space drag → world-space scroll: divide by zoom.
    this.cam.scrollX -= stepX / this.cam.zoom;
    this.cam.scrollY -= stepY / this.cam.zoom;
  }

  private onPointerUp(): void {
    const active = this.activeTouchPointers();
    if (active.length === 0) {
      this.isPanning = false;
      this.isPinching = false;
      this.panExceededThreshold = false;
      this.pinchPrevDist = 0;
    } else if (this.isPinching && active.length === 1) {
      // One finger lifted during pinch: stop pinch, don't auto-resume pan
      // (avoids a jarring jump). User can lift and re-tap to pan.
      this.isPinching = false;
      this.pinchPrevDist = 0;
    }
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _dx: number,
    deltaY: number,
  ): void {
    const factor = deltaY < 0 ? 1 + this.wheelZoomStep : 1 / (1 + this.wheelZoomStep);
    const newZoom = Phaser.Math.Clamp(this.cam.zoom * factor, this.minZoom, this.maxZoom);
    const p = this.scene.input.activePointer;
    this.zoomAround(p.x, p.y, newZoom);
  }

  // Zoom while keeping the world point under (screenX, screenY) fixed on screen.
  private zoomAround(screenX: number, screenY: number, newZoom: number): void {
    if (newZoom === this.cam.zoom) return;
    const before = this.cam.getWorldPoint(screenX, screenY);
    this.cam.setZoom(newZoom);
    const after = this.cam.getWorldPoint(screenX, screenY);
    this.cam.scrollX += before.x - after.x;
    this.cam.scrollY += before.y - after.y;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
  }
}
