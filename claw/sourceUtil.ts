export class SourceHelper {
    source: string

    indexedLines: [[string, number][], number][]

    constructor(source: string) {
        this.source = source;
        this.indexedLines = [];
        
        let i = 0;
        for (const line of source.split("\n")) {
            const out = [];
            for (const ch of line.split("")) {
                out.push([ch, i] as [string, number]);
                i++;
            }
            this.indexedLines.push([out, i]);
            i++; 
        }
    }

    getLines(start: number, end: number): string[] {
        const out = [];
        for (const [ln, idx] of this.indexedLines) {
            if (idx > start && idx <= end) {
                out.push(ln.map(a => a[0]).join(""))
            }
        }
        return out;
    }
    getLine(start: number): string {
        for (const [ln, idx] of this.indexedLines) {
            if (idx > start) {
                return ln.map(a => a[0]).join("");
            }
        }
        return this.indexedLines[this.indexedLines.length-1][0].map(a => a[0]).join("")
    }
    getColRow(position: number): [number, number] {
        let row = 0;
        let col = 0;
        for (row = 0; row < this.indexedLines.length; row++) {
            const r = this.indexedLines[row][0]
            for (col = 0; col < r.length; col++) {
                if (r[col][1] >= position) return [row, col];
            }
        }
        return [row, col];
    }
}