import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const CONTEXT_FILE = path.join(os.tmpdir(), "pi-vscode-context.json");

interface VsCodeContext {
	file: string;
	line: number;
	endLine: number;
	selection?: string;
	language: string;
}

let statusBar: vscode.StatusBarItem;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

let outputChannel: vscode.OutputChannel;

function writeContext(ctx: VsCodeContext | null): void {
	try {
		if (ctx === null) {
			if (fs.existsSync(CONTEXT_FILE)) fs.unlinkSync(CONTEXT_FILE);
		} else {
			fs.writeFileSync(CONTEXT_FILE, JSON.stringify(ctx), "utf-8");
		}
	} catch (e) {
		outputChannel.appendLine(`Failed to write context: ${e}`);
	}
}

function updateContext(): void {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		writeContext(null);
		statusBar.text = "$(code) Pi: no editor";
		statusBar.tooltip = "No active editor";
		return;
	}

	const selection = editor.document.getText(editor.selection);
	const startLine = editor.selection.start.line + 1;
	const endLine = editor.selection.end.line + 1;

	const ctx: VsCodeContext = {
		file: editor.document.uri.fsPath,
		line: startLine,
		endLine,
		selection: selection || undefined,
		language: editor.document.languageId,
	};

	writeContext(ctx);

	const filename = path.basename(ctx.file);
	const lineRange = startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
	const selInfo = ctx.selection ? ` (${ctx.selection.split("\n").length} lines)` : "";
	statusBar.text = `$(code) Pi: ${filename}:${lineRange}${selInfo}`;
	statusBar.tooltip = `Sharing with Pi: ${ctx.file}:${lineRange}${selInfo}`;
}

function scheduleUpdate(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(updateContext, 200);
}

export function activate(context: vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel("Pi Coding Agent");
	outputChannel.appendLine(`Pi VS Code extension activated. Context file: ${CONTEXT_FILE}`);
	context.subscriptions.push(outputChannel);

	statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.show();
	context.subscriptions.push(statusBar);

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(scheduleUpdate),
		vscode.window.onDidChangeActiveTextEditor(scheduleUpdate),
	);

	// Clean up context file on deactivate
	context.subscriptions.push(
		new vscode.Disposable(() => {
			writeContext(null);
		}),
	);

	updateContext();
}

export function deactivate(): void {
	writeContext(null);
}
