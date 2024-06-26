import core from "../core";
import { TimeChartPlugin } from "../plugins";

export interface SelectZoomOptions {
    mouseButtons: number;
    enableX: boolean;
    enableY: boolean;
    thresholdX: number;
    thresholdY: number;
    cancelOnSecondPointer: boolean;
}

const defaultOptions = {
    mouseButtons: 1,
    enableX: true,
    enableY: true,
    thresholdX: 0,
    thresholdY: 0,
    cancelOnSecondPointer: false,
} as const;

interface Point { x : number; y : number; };

export class SelectZoom {
    private visual: SVGRectElement;
    constructor(private readonly chart: core, public readonly options: SelectZoomOptions) {
        const el = chart.contentBoxDetector.node;
        el.tabIndex = -1;
        el.addEventListener('pointerdown', ev => this.onMouseDown(ev), { signal: chart.model.abortController.signal });
        el.addEventListener('pointerup', ev => this.onMouseUp(ev), { signal: chart.model.abortController.signal });
        el.addEventListener('pointermove', ev => this.onMouseMove(ev), { signal: chart.model.abortController.signal });
        el.addEventListener('pointercancel', ev => this.onPointerCancel(ev), { signal: chart.model.abortController.signal });
        el.addEventListener('keydown', ev => this.onKeyDown(ev), { signal: chart.model.abortController.signal });

        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = `
.timechart-selection {
    stroke: currentColor;
    stroke-width: 1;
    fill: gray;
    opacity: 0.5;
    visibility: hidden;
}`
        chart.svgLayer.svgNode.appendChild(style);

        this.visual = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.visual.classList.add('timechart-selection');
        chart.svgLayer.svgNode.appendChild(this.visual);
    }

    onKeyDown(ev: KeyboardEvent) {
        if (ev.code === 'Escape')
            this.reset();
    }

    private start: {p: Point, id: number} | null = null;
    private selectX: boolean = false;
    private selectY: boolean = false;

    private reset() {
        if (this.start === null)
            return;
        const el = this.chart.contentBoxDetector.node;
        el.releasePointerCapture(this.start.id);
        this.visual.style.visibility = 'hidden';
        this.start = null;
    }

    private getPoint(ev: PointerEvent): Point {
        const boundingRect = this.chart.svgLayer.svgNode.getBoundingClientRect();
        return {
            x: ev.clientX - boundingRect.left,
            y: ev.clientY - boundingRect.top,
        };
    }

    onMouseDown(ev: PointerEvent) {
        if (this.start !== null) {
            if (this.options.cancelOnSecondPointer)
                this.reset();
            return;
        }
        if (ev.pointerType === 'mouse' && (ev.buttons & this.options.mouseButtons) === 0)
            return;
        const el = this.chart.contentBoxDetector.node;
        this.start = {
            p: this.getPoint(ev),
            id: ev.pointerId,
        };
        el.setPointerCapture(ev.pointerId);

        this.visual.x.baseVal.value = this.start.p.x;
        this.visual.y.baseVal.value = this.start.p.y;
        this.visual.width.baseVal.value = 0;
        this.visual.height.baseVal.value = 0;
        this.visual.style.visibility = 'visible';
    }

    onMouseMove(ev: PointerEvent) {
        if (ev.pointerId !== this.start?.id)
            return;
        const p = this.getPoint(ev);

        const x = Math.min(this.start.p.x, p.x);
        const y = Math.min(this.start.p.y, p.y);
        const width = Math.abs(this.start.p.x - p.x);
        const height = Math.abs(this.start.p.y - p.y);
        const minWidth = Math.min(height, this.options.thresholdX);
        const minHeight = Math.min(width, this.options.thresholdY);
        this.selectX = width >= minWidth || !this.options.enableY;
        this.selectY = height > minHeight || !this.options.enableX;

        if (this.options.enableX && this.selectX) {
            this.visual.x.baseVal.value = x;
            this.visual.width.baseVal.value = width;
        } else {
            this.visual.setAttribute('x', '0');
            this.visual.setAttribute('width', '100%');
        }

        if (this.options.enableY && this.selectY) {
            this.visual.y.baseVal.value = y;
            this.visual.height.baseVal.value = height;
        } else {
            this.visual.setAttribute('y', '0');
            this.visual.setAttribute('height', '100%');
        }
    }

    onMouseUp(ev: PointerEvent) {
        if (ev.pointerId !== this.start?.id)
            return;

        const p = this.getPoint(ev);
        const x1 = Math.min(this.start.p.x, p.x);
        const x2 = Math.max(this.start.p.x, p.x);
        const y1 = Math.max(this.start.p.y, p.y);
        const y2 = Math.min(this.start.p.y, p.y);

        let changed = false;
        if (this.options.enableX && this.selectX && x2 != x1) {
            const newDomain = [
                this.chart.model.xScale.invert(x1),
                this.chart.model.xScale.invert(x2),
            ];
            this.chart.model.xScale.domain(newDomain);
            this.chart.options.xRange = null;
            changed = true;
        }
        if (this.options.enableY && this.selectY && y2 != y1) {
            const newDomain = [
                this.chart.model.yScale.invert(y1),
                this.chart.model.yScale.invert(y2),
            ];
            this.chart.model.yScale.domain(newDomain);
            this.chart.options.yRange = null;
            changed = true;
        }
        if (changed)
            this.chart.model.requestRedraw();

        this.reset();
    }

    onPointerCancel(ev: PointerEvent) {
        if (ev.pointerId === this.start?.id)
            this.reset();
    }
}

export class SelectZoomPlugin implements TimeChartPlugin<SelectZoom> {
    readonly options: SelectZoomOptions;
    constructor(options?: Partial<SelectZoomOptions>) {
        if (!options)
            options = {};
        if (!defaultOptions.isPrototypeOf(options))
            Object.setPrototypeOf(options, defaultOptions);
        this.options = options as SelectZoomOptions;
    }
    apply(chart: core) {
        return new SelectZoom(chart, this.options);
    }
}
