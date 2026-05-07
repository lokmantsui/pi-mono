/**
 * VS Code context bridge.
 * Reads the file written by the pi-vscode VS Code extension and:
 * - Shows a widget above the editor displaying the active file/line/selection
 * - Prepends the selection into every LLM context call so the model sees it
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

const CONTEXT_FILE = join(tmpdir(), "pi-vscode-context.json");
const WIDGET_KEY = "vscode-ctx";
const POLL_MS = 400;

interface VsCodeContext {
	file: string;
	line: number;
	endLine: number;
	selection?: string;
	language: string;
}

export default function vsCodeContextExtension(pi: ExtensionAPI) {
	let vsCtx: VsCodeContext | null = null;
	let lastFileContent = "";
	let sessionCtx: ExtensionContext | null = null;

	function readCtx(): boolean {
		try {
			if (!existsSync(CONTEXT_FILE)) {
				if (vsCtx !== null) {
					vsCtx = null;
					return true;
				}
				return false;
			}
			const raw = readFileSync(CONTEXT_FILE, "utf-8");
			if (raw === lastFileContent) return false;
			lastFileContent = raw;
			vsCtx = JSON.parse(raw) as VsCodeContext;
			return true;
		} catch {
			return false;
		}
	}

	function buildWidget(): string[] | undefined {
		if (!vsCtx) return undefined;
		const filename = basename(vsCtx.file);
		const lineRange = vsCtx.line === vsCtx.endLine ? `${vsCtx.line}` : `${vsCtx.line}-${vsCtx.endLine}`;
		const selInfo = vsCtx.selection ? ` · ${vsCtx.selection.split("\n").length} lines selected` : "";
		return [`  VS Code  ${filename}:${lineRange}${selInfo}`];
	}

	function buildContextBlock(c: VsCodeContext): string {
		const lineRange = c.line === c.endLine ? `${c.line}` : `${c.line}-${c.endLine}`;
		let block = `[VS Code Context]\nFile: ${c.file}:${lineRange}`;
		if (c.selection) {
			block += `\nSelected code:\n\`\`\`${c.language}\n${c.selection}\n\`\`\``;
		}
		return block + "\n\n";
	}

	function refreshWidget(): void {
		if (!sessionCtx?.hasUI) return;
		sessionCtx.ui.setWidget(WIDGET_KEY, buildWidget(), { placement: "aboveEditor" });
	}

	// Poll for context file changes and update widget
	setInterval(() => {
		if (readCtx()) refreshWidget();
	}, POLL_MS);

	pi.on("session_start", (_event, ctx) => {
		sessionCtx = ctx;
		readCtx();
		refreshWidget();
	});

	pi.on("context", (event) => {
		readCtx();
		if (!vsCtx) return {};

		const contextBlock = buildContextBlock(vsCtx);
		const messages = [...event.messages];

		// Prepend VS Code context to the last user message
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role === "user") {
				const content =
					typeof msg.content === "string"
						? contextBlock + msg.content
						: [{ type: "text" as const, text: contextBlock }, ...msg.content];
				messages[i] = { ...msg, content };
				break;
			}
		}

		return { messages };
	});
}
